/**
 * `wp worktree` subcommand dispatch.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'

import { scaffoldAgent } from '#cli/commands/init/scaffold-agent'
import { readConfig } from '#cli/commands/init/config'
import { resolveCatalogDir } from '#cli/commands/init/index'
import { getProjectRoot } from '#cli/utils'
import { runUnifiedSync } from '#symlinker/unified-sync'
import {
  deriveRepoNamespace,
  resolveGeneratedWorktreePath,
  resolveManagedWorktreeRoot,
  resolveWorktreeRoot,
} from '#worktrees/location.js'
import {
  adoptBlueprintOwnerWorktree,
  ensureBlueprintOwnerWorktree,
  readRepoOriginUrl,
  repoManagedRoot,
} from '#worktrees/manager.js'
import {
  pruneStaleWorktreeRegistryEntries,
  readWorktreeRegistry,
  upsertWorktreeRegistryEntry,
  type ManagedWorktreeEntry,
} from '#worktrees/registry.js'

export interface WorktreeCommandOptions {
  all?: boolean
  base?: string
  path?: string
  name?: string
  prefix?: string
  dryRun?: boolean
  force?: boolean
  cwd?: string
  repo?: string
}

export interface WorktreeEntry {
  path: string
  head: string
  branch: string | null
  bare: boolean
}

export interface NewWorktreeTarget {
  branch: string
  path: string
  generated: boolean
}

export interface NewWorktreeTargetInput {
  branch?: string
  name?: string
  prefix?: string
  explicitPath?: string
  repoRoot: string
  now?: Date
  randomSuffix?: () => string
  existingEntries?: WorktreeEntry[]
  branchExists?: (branch: string) => boolean
  pathExists?: (path: string) => boolean
}

export function parseWorktreePorcelain(raw: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  const blocks = raw.trim().split(/\n\n+/)
  for (const block of blocks) {
    if (!block.trim()) continue
    const lines = block.split('\n')
    let path = ''
    let head = ''
    let branch: string | null = null
    let bare = false
    for (const line of lines) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length)
      else if (line === 'bare') bare = true
    }
    if (path) entries.push({ path, head, branch, bare })
  }
  return entries
}

export function sanitizeWorktreeSegment(value: string, fallback = 'agent'): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || fallback
}

function formatTimestamp(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}-${hour}${minute}`
}

function defaultRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 5).padEnd(3, '0')
}

function defaultWorktreePath(repoRoot: string, branch: string): string {
  const pathSegment = sanitizeWorktreeSegment(branch)
  const originUrl = readRepoOriginUrl(repoRoot)
  return resolveGeneratedWorktreePath(resolveWorktreeRoot(repoRoot, { originUrl }), pathSegment)
}

function collides(
  branch: string,
  path: string,
  entries: WorktreeEntry[],
  branchExists: (branch: string) => boolean,
  pathExists: (path: string) => boolean,
): boolean {
  return branchExists(branch) || entries.some((e) => e.path === path) || pathExists(path)
}

export function resolveNewWorktreeTarget(input: NewWorktreeTargetInput): NewWorktreeTarget {
  if (input.explicitPath) {
    throw new Error(
      'Managed worktrees do not support custom creation paths; use wp worktree adopt or rebind instead.',
    )
  }

  const branch = input.branch?.trim()
  const name = input.name?.trim()
  if (branch && name) {
    throw new Error('Use either <branch> or --name, not both.')
  }

  if (branch) {
    return {
      branch,
      path: defaultWorktreePath(input.repoRoot, branch),
      generated: false,
    }
  }

  const prefix = sanitizeWorktreeSegment(input.prefix ?? 'agent')
  const now = input.now ?? new Date()
  const randomSuffix = input.randomSuffix ?? defaultRandomSuffix
  const entries = input.existingEntries ?? []
  const branchExists = input.branchExists ?? (() => false)
  const pathExists = input.pathExists ?? (() => false)
  const baseSlug = name ? sanitizeWorktreeSegment(name) : formatTimestamp(now)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = name && attempt === 0 ? '' : `-${sanitizeWorktreeSegment(randomSuffix(), 'x')}`
    const candidateBranch = `${prefix}/${baseSlug}${suffix}`
    const candidatePath = defaultWorktreePath(input.repoRoot, candidateBranch)
    if (!collides(candidateBranch, candidatePath, entries, branchExists, pathExists)) {
      return { branch: candidateBranch, path: candidatePath, generated: true }
    }
  }

  throw new Error('Could not generate a collision-free worktree branch/path after 20 attempts.')
}

export function resolveWorktreePath(nameOrPath: string, entries: WorktreeEntry[]): string {
  const match = entries.find(
    (e) =>
      e.path === nameOrPath ||
      basename(e.path) === nameOrPath ||
      e.branch === nameOrPath ||
      e.branch === `refs/heads/${nameOrPath}` ||
      e.branch?.replace('refs/heads/', '') === nameOrPath,
  )
  if (!match) {
    throw new Error(
      `No worktree matching "${nameOrPath}". Run \`wp worktree list\` to see available worktrees.`,
    )
  }
  return match.path
}

function gitBranchExists(repoRoot: string, branch: string): boolean {
  const result = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
    cwd: repoRoot,
  })
  return result.status === 0
}

function listEntries(repoRoot: string): WorktreeEntry[] {
  const raw = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  })
  return parseWorktreePorcelain(raw)
}

export function formatWorktreeList(
  entries: WorktreeEntry[],
  currentWorktreePath: string,
): string[] {
  if (entries.length === 0) return ['No worktrees found.']

  const pathWidth = Math.max(...entries.map((e) => e.path.length), 4)
  const branchLabels = entries.map((e) => e.branch?.replace('refs/heads/', '') ?? '(detached)')
  const branchWidth = Math.max(...branchLabels.map((b) => b.length), 6)
  const rows = [
    `  ${'PATH'.padEnd(pathWidth)}  ${'BRANCH'.padEnd(branchWidth)}  HEAD`,
    `  ${'-'.repeat(pathWidth)}  ${'-'.repeat(branchWidth)}  -------`,
  ]

  for (const [index, e] of entries.entries()) {
    const marker = e.path === currentWorktreePath ? '* ' : '  '
    const branchShort = branchLabels[index] ?? '(detached)'
    const headShort = e.head.slice(0, 7)
    rows.push(
      `${marker}${e.path.padEnd(pathWidth)}  ${branchShort.padEnd(branchWidth)}  ${headShort}`,
    )
  }

  return rows
}

export function formatManagedWorktreeList(entries: readonly ManagedWorktreeEntry[]): string[] {
  if (entries.length === 0) return ['No managed worktrees registered. Run `wp worktree refresh`.']
  const pathWidth = Math.max(...entries.map((entry) => entry.path.length), 4)
  const kindWidth = Math.max(...entries.map((entry) => entry.kind.length), 4)
  const rows = [
    `${'KIND'.padEnd(kindWidth)}  ${'BLUEPRINT'.padEnd(18)}  ${'BRANCH'.padEnd(18)}  PATH`,
    `${'-'.repeat(kindWidth)}  ${'-'.repeat(18)}  ${'-'.repeat(18)}  ${'-'.repeat(pathWidth)}`,
  ]
  for (const entry of entries) {
    rows.push(
      `${entry.kind.padEnd(kindWidth)}  ${(entry.blueprintSlug ?? '-').padEnd(18)}  ${(entry.branch ?? (entry.detached ? '(detached)' : '-')).padEnd(18)}  ${entry.path}`,
    )
  }
  return rows
}

async function handleNew(branch: string, opts: WorktreeCommandOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const repoRoot = getProjectRoot({ startDir: cwd })
  const existingEntries = listEntries(repoRoot)
  const target = resolveNewWorktreeTarget({
    branch,
    name: opts.name,
    prefix: opts.prefix,
    explicitPath: opts.path,
    repoRoot,
    existingEntries,
    branchExists: (candidate) => gitBranchExists(repoRoot, candidate),
    pathExists: existsSync,
  })

  if (opts.dryRun) {
    console.log('[dry-run] Would create managed worktree:')
    console.log(`  branch: ${target.branch}`)
    console.log(`  path:   ${target.path}`)
    console.log(`  base:   ${opts.base ?? 'HEAD'}`)
    return
  }

  const gitArgs = ['worktree', 'add', '-b', target.branch, target.path]
  if (opts.base) gitArgs.push(opts.base)

  const addResult = spawnSync('git', gitArgs, { cwd: repoRoot, stdio: 'inherit' })
  if (addResult.status !== 0) {
    throw new Error('git worktree add failed')
  }

  const catalogDir = resolveCatalogDir()
  scaffoldAgent({ catalogDir, repoRoot: target.path, options: {} })
  // The worktree inherits the repo's host selection (tracked .webpressorc.json),
  // so skill-dir projection is gated the same way as in the main checkout.
  const worktreeHosts = (readConfig(target.path) ?? readConfig(repoRoot))?.hosts?.selected
  runUnifiedSync({
    catalogDir,
    consumerRoot: target.path,
    ...(worktreeHosts ? { hosts: worktreeHosts } : {}),
  })

  console.log(`\nWorktree ready: ${target.path}`)
  console.log(`  branch: ${target.branch}`)
  console.log(`  cd ${target.path}`)
}

function handleList(opts: WorktreeCommandOptions): void {
  if (opts.all) {
    console.log(formatManagedWorktreeList(readWorktreeRegistry().entries).join('\n'))
    return
  }

  const cwd = opts.cwd ?? process.cwd()
  const repoRoot = getProjectRoot({ startDir: cwd })

  const entries = listEntries(repoRoot)
  console.log(formatWorktreeList(entries, repoRoot).join('\n'))
}

function handleRoot(opts: WorktreeCommandOptions): void {
  const cwd = opts.repo ?? opts.cwd ?? process.cwd()
  if (opts.all) console.log(resolveManagedWorktreeRoot())
  else console.log(repoManagedRoot(getProjectRoot({ startDir: cwd })))
}

function handleRefresh(opts: WorktreeCommandOptions): void {
  if (opts.all) {
    const registry = readWorktreeRegistry()
    console.log(`Managed registry entries: ${registry.entries.length}`)
    console.log('Use `wp worktree refresh --repo <path>` to live-probe a specific repository.')
    return
  }

  const repoRoot = getProjectRoot({ startDir: opts.repo ?? opts.cwd ?? process.cwd() })
  const originUrl = readRepoOriginUrl(repoRoot)
  const repoNamespace = deriveRepoNamespace({ repoRoot, originUrl })
  const entries = listEntries(repoRoot)
  const managedRoot = resolveWorktreeRoot(repoRoot, { originUrl })
  let updated = 0
  for (const entry of entries) {
    if (!entry.path.startsWith(`${managedRoot}/`)) continue
    upsertWorktreeRegistryEntry({
      id: `git-${repoNamespace}-${basename(entry.path)}`,
      repoNamespace,
      repoRoot,
      ...(originUrl && { repoOriginUrl: originUrl }),
      kind: entry.path.includes('/.scratch/') ? 'scratch' : 'owner',
      path: entry.path,
      ...(entry.branch && { branch: entry.branch.replace('refs/heads/', '') }),
      detached: entry.branch === null,
      lastSeenAt: new Date().toISOString(),
    })
    updated += 1
  }
  console.log(
    `Refreshed ${updated} managed worktree entr${updated === 1 ? 'y' : 'ies'} for ${repoRoot}.`,
  )
}

function handlePrune(opts: WorktreeCommandOptions): void {
  if (!opts.all) throw new Error('Usage: wp worktree prune --all')
  const result = pruneStaleWorktreeRegistryEntries()
  console.log(
    `Pruned ${result.removed.length} stale managed registry entr${result.removed.length === 1 ? 'y' : 'ies'}.`,
  )
}

function handleMigrate(opts: WorktreeCommandOptions): void {
  const repoRoot = getProjectRoot({ startDir: opts.repo ?? opts.cwd ?? process.cwd() })
  const legacyRoot = join(dirname(repoRoot), `${basename(repoRoot)}_worktrees`)
  if (!existsSync(legacyRoot)) {
    console.log(`No legacy sibling worktree root found: ${legacyRoot}`)
    return
  }

  const targetRoot = repoManagedRoot(repoRoot)
  const legacyEntries = listEntries(repoRoot).filter(
    (entry) => entry.path === legacyRoot || entry.path.startsWith(`${legacyRoot}/`),
  )
  if (legacyEntries.length === 0) {
    console.log(`No git-registered worktrees found below ${legacyRoot}; manual migration required.`)
    return
  }

  let moved = 0
  const manual: string[] = []
  for (const entry of legacyEntries) {
    const targetPath = join(targetRoot, relative(legacyRoot, entry.path))
    if (opts.dryRun) {
      console.log(`[dry-run] Would move ${entry.path} -> ${targetPath}`)
      continue
    }
    mkdirSync(dirname(targetPath), { recursive: true })
    const result = spawnSync('git', ['worktree', 'move', entry.path, targetPath], {
      cwd: repoRoot,
      stdio: 'inherit',
    })
    if (result.status === 0) moved += 1
    else manual.push(entry.path)
  }

  if (!opts.dryRun) handleRefresh({ ...opts, repo: repoRoot })
  console.log(`Migrated ${moved} legacy worktree${moved === 1 ? '' : 's'} to ${targetRoot}.`)
  if (manual.length > 0) {
    console.log(`Manual follow-up required for locked/unmoved worktrees: ${manual.join(', ')}`)
  }
}

function handleAdopt(args: string[], opts: WorktreeCommandOptions): void {
  const [slug, worktreePath] = args
  if (!slug || !worktreePath) throw new Error('Usage: wp worktree adopt <blueprint-slug> <path>')
  const repoRoot = getProjectRoot({ startDir: opts.repo ?? opts.cwd ?? process.cwd() })
  const binding = adoptBlueprintOwnerWorktree(repoRoot, slug, worktreePath)
  console.log(`Adopted ${worktreePath} as owner for ${slug}`)
  console.log(`  worktree_owner_id: ${binding.id}`)
  console.log(`  worktree_owner_branch: ${binding.branch}`)
}

function handleRebind(args: string[], opts: WorktreeCommandOptions): void {
  const slug = args[0]
  if (!slug) throw new Error('Usage: wp worktree rebind <blueprint-slug> [--path <path>]')
  const repoRoot = getProjectRoot({ startDir: opts.repo ?? opts.cwd ?? process.cwd() })
  const binding = opts.path
    ? adoptBlueprintOwnerWorktree(repoRoot, slug, opts.path)
    : ensureBlueprintOwnerWorktree(repoRoot, slug, { dryRun: opts.dryRun })
  console.log(`Rebound owner for ${slug}`)
  console.log(`  worktree_owner_id: ${binding.id}`)
  console.log(`  worktree_owner_branch: ${binding.branch}`)
  console.log(`  path: ${binding.path}`)
}

function handleRemove(nameOrPath: string, opts: WorktreeCommandOptions): void {
  const cwd = opts.cwd ?? process.cwd()
  const repoRoot = getProjectRoot({ startDir: cwd })

  const entries = listEntries(repoRoot)
  const resolved = resolveWorktreePath(nameOrPath, entries)

  const gitArgs = ['worktree', 'remove', resolved]
  if (opts.force) gitArgs.push('--force')

  const result = spawnSync('git', gitArgs, { cwd: repoRoot, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error('git worktree remove failed')
  }
}

export async function executeWorktreeSubcommand(
  subcommand: string,
  args: string[],
  opts: WorktreeCommandOptions,
): Promise<void> {
  switch (subcommand) {
    case 'root':
      handleRoot(opts)
      return
    case 'new': {
      const branch = args[0]
      await handleNew(branch ?? '', opts)
      return
    }
    case 'list': {
      handleList(opts)
      return
    }
    case 'refresh':
      handleRefresh(opts)
      return
    case 'prune':
      handlePrune(opts)
      return
    case 'migrate':
      handleMigrate(opts)
      return
    case 'adopt':
      handleAdopt(args, opts)
      return
    case 'rebind':
      handleRebind(args, opts)
      return
    case 'remove':
    case 'rm': {
      const nameOrPath = args[0]
      if (!nameOrPath) {
        throw new Error('Usage: wp worktree remove <branch-or-path> [--force]')
      }
      handleRemove(nameOrPath, opts)
      return
    }
    default: {
      throw new Error(
        `Unknown worktree subcommand: "${subcommand}"\n\nUse one of: root, new, list, refresh, prune, migrate, adopt, rebind, remove`,
      )
    }
  }
}
