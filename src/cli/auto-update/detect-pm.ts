/**
 * Package-manager detection for the auto-update installer.
 *
 * Returns the `{manager, command}` tuple that the installer can use to
 * re-install `@webpresso/agent-kit` globally, OR returns `{abort: <reason>}`
 * when no safe install command can be inferred (e.g. devDep install, Volta
 * shim, unknown manager). The caller turns `abort` into a notify-only outcome.
 *
 * Detection priority:
 *   0. Source/git install — argv1 resolves into the webpresso/agent-kit clone
 *      → `git -C <repo> pull` (works for symlink dev installs).
 *   1. `process.env.npm_config_user_agent` — most reliable; set by the
 *      manager whenever the CLI is launched via the manager's run wrapper.
 *   2. Realpath walk of `argv0` looking for store markers (`.pnpm-store`,
 *      `.bun/install`, `.volta/tools`, `.yarn/global`, Homebrew prefix).
 *   3. Confirm the install is global; abort if it's a devDep consumer.
 *   4. Volta / asdf shim → abort with a manual-command hint.
 *   5. Unknown → abort.
 */

import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { delimiter, dirname, sep } from 'node:path'

export type ManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'git'

export interface DetectSuccess {
  manager: ManagerName
  command: string[]
}

export interface DetectAbort {
  abort: string
}

export type DetectResult = DetectSuccess | DetectAbort

export const GH_PACKAGE_NAME = '@webpresso/agent-kit'
export const GH_PACKAGES_REGISTRY = 'https://npm.pkg.github.com'

const INSTALL_COMMANDS: Record<Exclude<ManagerName, 'git'>, string[]> = {
  npm: ['npm', 'install', '-g', GH_PACKAGE_NAME, '--registry', GH_PACKAGES_REGISTRY],
  pnpm: ['pnpm', 'add', '-g', GH_PACKAGE_NAME, '--registry', GH_PACKAGES_REGISTRY],
  yarn: ['yarn', 'global', 'add', GH_PACKAGE_NAME],
  bun: ['bun', 'add', '-g', GH_PACKAGE_NAME],
}

/**
 * Detect whether argv1 is a symlink pointing into the webpresso/agent-kit
 * source clone. Returns the git worktree root if so, null otherwise.
 * Exported for testability.
 */
export function detectGitInstall(argv1: string): string | null {
  const real = safeRealpath(argv1)
  if (real === null) return null
  try {
    const topLevel = execFileSync('git', ['-C', dirname(real), 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const remote = execFileSync('git', ['-C', topLevel, 'remote', 'get-url', 'origin'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (remote.includes('webpresso/agent-kit')) return topLevel
  } catch {
    // not inside a git repo or not the right repo
  }
  return null
}

/**
 * Detect the package manager that owns the running `webpresso` binary.
 * Pure function modulo `realpathSync` and `execFileSync` — call sites mock
 * those for tests.
 */
export function detect(env: NodeJS.ProcessEnv, argv0: string): DetectResult {
  // Priority 0 — source/git install (symlink → repo clone).
  const gitDir = detectGitInstall(argv0)
  if (gitDir !== null) {
    return { manager: 'git', command: ['git', '-C', gitDir, 'pull'] }
  }

  // Priority 1 — user-agent string set by the package manager.
  const userAgent = env.npm_config_user_agent
  if (userAgent !== undefined && userAgent !== '') {
    const fromUa = parseUserAgent(userAgent)
    if (fromUa !== null) {
      return { manager: fromUa, command: INSTALL_COMMANDS[fromUa] }
    }
  }

  // Priority 2 — realpath walk of argv0 for store markers.
  const realpath = safeRealpath(argv0)
  if (realpath !== null) {
    // Priority 4 (run before 2 success) — Volta / asdf shims.
    const shim = detectShim(realpath)
    if (shim !== null) {
      return { abort: shim }
    }

    const fromPath = matchStoreMarker(realpath)
    if (fromPath !== null) {
      if (!confirmInstalledGlobally(realpath, env)) {
        return {
          abort: `webpresso is not a global install (path ${realpath}); auto-install disabled.`,
        }
      }
      return { manager: fromPath, command: INSTALL_COMMANDS[fromPath] }
    }
  }

  // Priority 5 — give up; the caller falls back to notify-only.
  return {
    abort: 'Unable to detect a package manager for webpresso; auto-install disabled.',
  }
}

/**
 * Parse the `npm_config_user_agent` string. Format examples:
 *   npm/10.2.4 node/v22.0.0 darwin x64 workspaces/false
 *   pnpm/10.33.0 npm/? node/v22.0.0 darwin arm64
 *   yarn/1.22.22 npm/? node/v22.0.0 darwin arm64
 *   bun/1.1.0 npm/? node/v22.0.0 darwin arm64
 *
 * Returns the manager name if the leading token matches a known manager.
 * Exported for testability.
 */
export function parseUserAgent(userAgent: string): Exclude<ManagerName, 'git'> | null {
  const trimmed = userAgent.trim()
  if (trimmed.length === 0) return null
  const head = trimmed.split(/\s+/, 1)[0]
  if (head === undefined) return null
  const slash = head.indexOf('/')
  const name = (slash === -1 ? head : head.slice(0, slash)).toLowerCase()
  if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun') {
    return name
  }
  return null
}

/**
 * Look for known package-manager store markers in a realpath. The walk is a
 * substring check against path segments to avoid false positives in user
 * directory names.
 * Exported for testability.
 */
export function matchStoreMarker(realpath: string): Exclude<ManagerName, 'git'> | null {
  const segments = splitPathSegments(realpath)
  // pnpm: any path under `<store>/.pnpm/...` or containing `.pnpm-store`.
  if (segments.some((seg) => seg === '.pnpm' || seg === '.pnpm-store' || seg === 'pnpm-global')) {
    return 'pnpm'
  }
  // bun: installs under `~/.bun/install/global/...`.
  if (segments.includes('.bun') && (segments.includes('install') || segments.includes('global'))) {
    return 'bun'
  }
  // yarn classic global dir is `~/.yarn/global/`.
  // yarn 2+ uses `.yarn/berry` or `.yarn/cache` for installs.
  if (segments.includes('.yarn') && (segments.includes('global') || segments.includes('berry'))) {
    return 'yarn'
  }
  // Homebrew (`/usr/local/Cellar/node/...`, `/opt/homebrew/Cellar/...`) and
  // npm prefix (`/usr/local/lib/node_modules`, `~/.npm-global`) → npm.
  if (segments.includes('Cellar')) return 'npm'
  if (segments.includes('node_modules') && segments.includes('lib')) return 'npm'
  if (segments.includes('.npm-global')) return 'npm'
  if (segments.includes('.npm') && segments.includes('node_modules')) return 'npm'
  return null
}

/**
 * Detect Volta / asdf shim layouts. These intercept the binary lookup such
 * that an in-place `npm install -g` won't pick up. Returns a user-facing
 * abort reason or null.
 * Exported for testability.
 */
export function detectShim(realpath: string): string | null {
  const segments = splitPathSegments(realpath)
  if (segments.includes('.volta')) {
    return 'webpresso is managed by Volta; run `volta install webpresso` to upgrade.'
  }
  if (segments.includes('.asdf')) {
    return 'webpresso is managed by asdf; run `asdf reshim nodejs` after upgrading the runtime.'
  }
  return null
}

/**
 * Cheap confirmation that the binary lives outside of a project-local
 * `node_modules/.bin` (devDep consumer). The `is-installed-globally` npm
 * package is the upstream choice; we inline an equivalent check so this
 * module can be tested without that dep installed.
 * Exported for testability.
 */
export function confirmInstalledGlobally(realpath: string, env: NodeJS.ProcessEnv): boolean {
  const segments = splitPathSegments(realpath)
  // If the realpath sits inside a project's node_modules and does NOT match
  // a known global prefix (`.pnpm-store`, `.bun/install/global`, `.yarn/global`,
  // `Cellar`, `lib/node_modules`), call it a devDep install.
  const insideNodeModules = segments.includes('node_modules')
  if (!insideNodeModules) return true
  // Global prefixes contain node_modules but are still global.
  if (segments.includes('Cellar')) return true
  if (segments.includes('lib') && segments.includes('node_modules')) return true
  if (segments.includes('.npm-global')) return true
  if (segments.includes('.pnpm') || segments.includes('.pnpm-store')) return true
  if (segments.includes('.bun')) return true
  if (segments.includes('.yarn') && segments.includes('global')) return true
  // Compare against env-provided prefixes when available.
  const prefix = env.npm_config_prefix ?? env.PNPM_HOME ?? env.BUN_INSTALL
  if (prefix !== undefined && prefix !== '' && realpath.startsWith(prefix)) return true
  return false
}

function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p)
  } catch {
    return null
  }
}

function splitPathSegments(p: string): string[] {
  // Strip drive letter / leading separator, split on the OS separator, drop
  // empties. Works for both POSIX (`/`) and Windows (`\\`) layouts.
  const normalized = p.replace(/\\/g, sep)
  const stripped = normalized.startsWith(sep) ? normalized.slice(sep.length) : normalized
  return stripped.split(sep).filter((s) => s.length > 0 && s !== delimiter)
}
