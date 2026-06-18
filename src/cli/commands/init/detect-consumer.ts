/**
 * Detect the consumer repo that `wp init` is running against.
 *
 * Walks for a `.git` directory (the consumer is not required to use pnpm
 * workspaces — single-package projects are fine). Reads `package.json` and
 * `pnpm-workspace.yaml` when present to power downstream template rendering.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AGENT_KIT_PACKAGE_NAMES = new Set(['@webpresso/agent-kit'])

export interface ConsumerPackageInfo {
  name: string
  version?: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

export interface WorkspacePackageInfo {
  name: string
  relativePath: string
  absolutePath: string
  shortName: string
}

export interface ConsumerContext {
  repoRoot: string
  packageJsonPath: string | null
  packageJson: ConsumerPackageInfo | null
  hasPnpmWorkspace: boolean
  workspacePackages: WorkspacePackageInfo[]
}

export function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir)
  for (;;) {
    if (existsSync(path.join(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export function readPackageJson(repoRoot: string): {
  path: string | null
  info: ConsumerPackageInfo | null
} {
  const candidate = path.join(repoRoot, 'package.json')
  if (!existsSync(candidate)) return { path: null, info: null }
  try {
    const raw = readFileSync(candidate, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const name = typeof parsed['name'] === 'string' ? parsed['name'] : path.basename(repoRoot)
    const version = typeof parsed['version'] === 'string' ? parsed['version'] : undefined
    const deps = (parsed['dependencies'] ?? {}) as Record<string, string>
    const devDeps = (parsed['devDependencies'] ?? {}) as Record<string, string>
    return {
      path: candidate,
      info: { name, version, dependencies: deps, devDependencies: devDeps },
    }
  } catch {
    return { path: candidate, info: null }
  }
}

/**
 * Parse `pnpm-workspace.yaml` enough to extract the `packages:` glob list.
 * We avoid pulling in a YAML dep for this — the file format is stable and
 * we only need the `packages:` block.
 */
export function parseWorkspaceGlobs(repoRoot: string): string[] | null {
  const wsPath = path.join(repoRoot, 'pnpm-workspace.yaml')
  if (!existsSync(wsPath)) return null
  try {
    const raw = readFileSync(wsPath, 'utf8')
    const globs: string[] = []
    let inPackages = false
    for (const rawLine of raw.split('\n')) {
      const line = rawLine.replace(/\r$/, '')
      if (/^packages:\s*$/.test(line)) {
        inPackages = true
        continue
      }
      if (inPackages) {
        const trimmed = line.trim()
        // Stop at a new top-level key
        if (
          line.length > 0 &&
          !line.startsWith(' ') &&
          !line.startsWith('-') &&
          !line.startsWith('\t')
        ) {
          inPackages = false
          continue
        }
        const match = /^-\s*['"]?([^'"\s#]+)['"]?/.exec(trimmed)
        if (match && match[1]) globs.push(match[1])
      }
    }
    return globs
  } catch {
    return null
  }
}

/**
 * Expand a pnpm workspace glob against `repoRoot`, returning resolved
 * package directories that contain a `package.json`.
 *
 * Supports: `pkg/foo`, `pkg/*`, `pkg/**`. Globs are applied at directory
 * boundaries; we don't need full glob semantics.
 */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function safeRealpath(target: string): string | null {
  try {
    return realpathSync(target)
  } catch {
    return null
  }
}

function isWithinPath(target: string, root: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function discoverInstalledAgentKitRoots(repoRoot: string): string[] {
  const roots = new Set<string>()

  for (const directRoot of [path.join(repoRoot, 'node_modules', '@webpresso', 'agent-kit')]) {
    if (existsSync(path.join(directRoot, 'package.json'))) {
      roots.add(directRoot)
    }
  }

  const pnpmRoot = path.join(repoRoot, 'node_modules', '.pnpm')
  for (const entry of safeReaddir(pnpmRoot)) {
    const candidates: string[] = []
    if (entry.startsWith('@webpresso+agent-kit@')) {
      candidates.push(path.join(pnpmRoot, entry, 'node_modules', '@webpresso', 'agent-kit'))
    }
    for (const candidate of candidates) {
      if (existsSync(path.join(candidate, 'package.json'))) {
        roots.add(candidate)
      }
    }
  }

  return [...roots]
}

function isLocalAgentKitCli(repoRoot: string, cliPath: string): boolean {
  const cliCandidates = [
    ...new Set([cliPath, safeRealpath(cliPath)].filter((p): p is string => p !== null)),
  ]
  if (cliCandidates.length === 0) return false

  for (const root of discoverInstalledAgentKitRoots(repoRoot)) {
    const rootCandidates = [
      ...new Set([root, safeRealpath(root)].filter((p): p is string => p !== null)),
    ]
    for (const candidate of cliCandidates) {
      if (rootCandidates.some((rootPath) => isWithinPath(candidate, rootPath))) {
        return true
      }
    }
  }

  return false
}

function isDirectory(full: string): boolean {
  try {
    return statSync(full).isDirectory()
  } catch {
    return false
  }
}

function expandGlob(repoRoot: string, glob: string): string[] {
  const segments = glob.split('/').filter((s) => s.length > 0)
  let frontier: string[] = [repoRoot]

  for (const segment of segments) {
    const next: string[] = []
    for (const dir of frontier) {
      if (!existsSync(dir)) continue
      if (segment === '**') {
        const stack: string[] = [dir]
        while (stack.length > 0) {
          const popped = stack.pop()
          if (popped === undefined) break
          next.push(popped)
          for (const entry of safeReaddir(popped)) {
            if (entry === 'node_modules' || entry.startsWith('.')) continue
            const full = path.join(popped, entry)
            if (isDirectory(full)) stack.push(full)
          }
        }
      } else if (segment === '*') {
        for (const entry of safeReaddir(dir)) {
          if (entry === 'node_modules' || entry.startsWith('.')) continue
          const full = path.join(dir, entry)
          if (isDirectory(full)) next.push(full)
        }
      } else {
        const full = path.join(dir, segment)
        if (isDirectory(full)) next.push(full)
      }
    }
    frontier = next
  }

  return frontier
}

export function discoverWorkspacePackages(
  repoRoot: string,
  globs: string[] | null,
): WorkspacePackageInfo[] {
  if (!globs || globs.length === 0) return []
  const seen = new Set<string>()
  const out: WorkspacePackageInfo[] = []
  for (const glob of globs) {
    for (const dir of expandGlob(repoRoot, glob)) {
      const pkgPath = path.join(dir, 'package.json')
      if (seen.has(dir)) continue
      if (!existsSync(pkgPath)) continue
      seen.add(dir)
      try {
        const raw = readFileSync(pkgPath, 'utf8')
        const parsed = JSON.parse(raw) as { name?: string }
        const fullName = typeof parsed.name === 'string' ? parsed.name : path.basename(dir)
        const shortName = fullName.includes('/') ? (fullName.split('/')[1] ?? fullName) : fullName
        out.push({
          name: fullName,
          relativePath: path.relative(repoRoot, dir) || '.',
          absolutePath: dir,
          shortName,
        })
      } catch {
        /* skip malformed package */
      }
    }
  }
  return out.toSorted((a, b) => a.name.localeCompare(b.name))
}

/**
 * Soft warning for the published-consumer install contract. Consumers run the
 * global Vite+ `wp` binary and pin `@webpresso/agent-kit` to a published semver
 * range in package.json. Source/JIT mode is reserved for this repo via
 * `WP_FORCE_SOURCE=1`.
 */
export function warnIfNonLocalCli(repoRoot: string, cliUrl: string = import.meta.url): void {
  const ourPkg = readPackageJson(repoRoot).info
  if (ourPkg?.name !== undefined && AGENT_KIT_PACKAGE_NAMES.has(ourPkg.name)) return

  let cliPath: string
  try {
    cliPath = fileURLToPath(cliUrl)
  } catch {
    return
  }

  const pinnedVersion =
    ourPkg?.dependencies['@webpresso/agent-kit'] ??
    ourPkg?.devDependencies['@webpresso/agent-kit'] ??
    null

  if (isLocalAgentKitCli(repoRoot, cliPath)) {
    console.error(
      `warning: wp is running from this repo's node_modules (${cliPath}). ` +
        'Consumers must use the global Vite+ install: `vp install -g @webpresso/agent-kit`, then run `wp setup`.',
    )
    return
  }

  if (typeof pinnedVersion !== 'string' || !isPublishedAgentKitRange(pinnedVersion)) {
    console.error(
      'warning: missing or invalid @webpresso/agent-kit dependency pin. ' +
        'Consumers must pin a published semver range in package.json, run `vp install`, then use global `wp setup`.',
    )
  }
}

function isPublishedAgentKitRange(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (trimmed === 'latest') return false
  if (/^(workspace|file|link):/u.test(trimmed)) return false
  return /^(?:[~^]?\d+\.\d+\.\d+|[><=]|\*)/u.test(trimmed)
}

/**
 * agent-kit's own package name — the source repo for every agent-surface
 * template (`catalog/`, the tracked `.agent/`/`.claude/` surfaces). Scaffolding
 * into this repo overwrites the canonical sources, so `wp setup` refuses it
 * unless explicitly overridden. Only `@webpresso/agent-kit` hosts the catalog
 * templates.
 */
export const AGENT_KIT_PACKAGE_NAME = '@webpresso/agent-kit'

/** True when the consumer being scaffolded is agent-kit's own template-source repo. */
export function isAgentKitTemplateSourceRepo(packageName: string | undefined): boolean {
  return packageName === AGENT_KIT_PACKAGE_NAME
}

export function setupCommandForRepo(
  repoRoot: string,
  options: { readonly restoreHooks?: boolean } = {},
): string {
  const packageName = readPackageJson(repoRoot).info?.name
  const restoreHooks = options.restoreHooks === true ? ' --restore-hooks' : ''
  const sourceMaintenance = isAgentKitTemplateSourceRepo(packageName) ? ' --source-maintenance' : ''
  return `wp setup${restoreHooks}${sourceMaintenance}`
}

export function detectConsumer(startDir: string = process.cwd()): ConsumerContext | null {
  const repoRoot = findGitRoot(startDir)
  if (!repoRoot) return null
  const { path: pkgPath, info } = readPackageJson(repoRoot)
  const globs = parseWorkspaceGlobs(repoRoot)
  const workspacePackages = discoverWorkspacePackages(repoRoot, globs)
  return {
    repoRoot,
    packageJsonPath: pkgPath,
    packageJson: info,
    hasPnpmWorkspace: globs !== null,
    workspacePackages,
  }
}
