/**
 * `ak worktree` subcommand dispatch.
 *
 * Handles: new, list, remove
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'

import { scaffoldAgent } from '#cli/commands/init/scaffold-agent'
import { resolveCatalogDir } from '#cli/commands/init/index'
import { runUnifiedSync } from '#symlinker/unified-sync'
import { getProjectRoot } from '#cli/utils'

export interface WorktreeCommandOptions {
  base?: string
  path?: string
  force?: boolean
  cwd?: string
}

export interface WorktreeEntry {
  path: string
  head: string
  branch: string | null
  bare: boolean
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
      `No worktree matching "${nameOrPath}". Run \`ak worktree list\` to see available worktrees.`,
    )
  }
  return match.path
}

function listEntries(repoRoot: string): WorktreeEntry[] {
  const raw = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  })
  return parseWorktreePorcelain(raw)
}

async function handleNew(branch: string, opts: WorktreeCommandOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const repoRoot = getProjectRoot({ startDir: cwd })

  const sanitized = branch.replace(/[^a-z0-9_.-]/gi, '-')
  const worktreePath = opts.path ?? join(dirname(repoRoot), `${basename(repoRoot)}-${sanitized}`)

  const gitArgs = ['worktree', 'add', '-b', branch, worktreePath]
  if (opts.base) gitArgs.push(opts.base)

  const addResult = spawnSync('git', gitArgs, { cwd: repoRoot, stdio: 'inherit' })
  if (addResult.status !== 0) {
    throw new Error('git worktree add failed')
  }

  const catalogDir = resolveCatalogDir()
  scaffoldAgent({ catalogDir, repoRoot: worktreePath, options: {} })
  runUnifiedSync({ catalogDir, consumerRoot: worktreePath })

  console.log(`\nWorktree ready: ${worktreePath}`)
  console.log(`  cd ${worktreePath}`)
}

function handleList(opts: WorktreeCommandOptions): void {
  const cwd = opts.cwd ?? process.cwd()
  const repoRoot = getProjectRoot({ startDir: cwd })
  const currentPath = process.cwd()

  const entries = listEntries(repoRoot)
  if (entries.length === 0) {
    console.log('No worktrees found.')
    return
  }

  const pathWidth = Math.max(...entries.map((e) => e.path.length), 4)
  const branchLabels = entries.map((e) => e.branch?.replace('refs/heads/', '') ?? '(detached)')
  const branchWidth = Math.max(...branchLabels.map((b) => b.length), 6)

  console.log(`  ${'PATH'.padEnd(pathWidth)}  ${'BRANCH'.padEnd(branchWidth)}  HEAD`)
  console.log(`  ${'-'.repeat(pathWidth)}  ${'-'.repeat(branchWidth)}  -------`)

  for (const e of entries) {
    const marker = e.path === currentPath ? '* ' : '  '
    const branchShort = e.branch?.replace('refs/heads/', '') ?? '(detached)'
    const headShort = e.head.slice(0, 7)
    console.log(
      `${marker}${e.path.padEnd(pathWidth)}  ${branchShort.padEnd(branchWidth)}  ${headShort}`,
    )
  }
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
    case 'new': {
      const branch = args[0]
      if (!branch) {
        throw new Error('Usage: ak worktree new <branch> [--base <ref>] [--path <dir>]')
      }
      await handleNew(branch, opts)
      return
    }
    case 'list': {
      handleList(opts)
      return
    }
    case 'remove':
    case 'rm': {
      const nameOrPath = args[0]
      if (!nameOrPath) {
        throw new Error('Usage: ak worktree remove <branch-or-path> [--force]')
      }
      handleRemove(nameOrPath, opts)
      return
    }
    default: {
      throw new Error(
        `Unknown worktree subcommand: "${subcommand}"\n\nUse one of: new, list, remove`,
      )
    }
  }
}
