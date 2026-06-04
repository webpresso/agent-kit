/**
 * Centralized blueprint projection-DB path policy.
 *
 * Single source of truth for where the SQLite projection of blueprint markdown
 * lives, plus the two lock files that gate writes to that projection and to
 * the underlying markdown directory.
 *
 * ## Lock-scope decision (F9 / R7, Task 1.1)
 *
 * We adopt the **two-lock** policy:
 *
 * 1. **Projection DB lock — `'repo'` scope.**
 *    The SQLite file at `getSurfacePath('blueprints/blueprints.db', 'repo', cwd)`
 *    is a per-repo derived artifact shared by worktrees of the same repository.
 *    Concurrent writers therefore serialize at repo scope.
 *
 * 2. **Markdown-mutation lock — `'repo'` scope.**
 *    The `blueprints/` markdown directory is git-tracked and shared across
 *    all worktrees of the same repository. Cross-worktree concurrent writers
 *    that mutate markdown (`advanceTask`, `promoteBlueprint`, `finalizeBlueprint`)
 *    must serialize against each other. This lock guards the directory, not
 *    the DB.
 *
 * ## Silent advisory escape removed
 *
 * The legacy `acquireLock` helper in `cold-start.ts` waited up to 5 s and then
 * "proceeded anyway" if it could not acquire. That escape is removed on write
 * paths — write callers must use the typed lock helpers in this module, which
 * raise `LockTimeoutError` on failure. Read-only paths may proceed without a
 * lock (they take a consistent SQLite snapshot regardless).
 *
 * ## Non-git fallback
 *
 * Non-git temp repos (most tests, ad-hoc directories) cannot resolve a repo
 * key. Those callers use a deterministic user-state path keyed by the absolute
 * cwd rather than writing legacy `.agent/.blueprints.db` artifacts into the
 * repo itself.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, realpathSync } from 'node:fs'
import path from 'node:path'

import lockfile from 'proper-lockfile'

import { getStateRoot, getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'

const SURFACE_DB = 'blueprints/blueprints.db'
const SURFACE_DB_LOCK = 'blueprints/blueprints.db.lock'
const SURFACE_MARKDOWN_LOCK = 'blueprints/markdown.lock'

export class LockTimeoutError extends Error {
  readonly lockPath: string
  readonly nextAction: 'reingest_project'

  constructor(lockPath: string, cause?: unknown) {
    super(`Timed out acquiring blueprint lock at ${lockPath}`)
    this.name = 'LockTimeoutError'
    this.lockPath = lockPath
    this.nextAction = 'reingest_project'
    if (cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = cause
    }
  }
}

function nonGitStatePath(cwd: string, filename: string): string {
  const absoluteCwd = realpathSync(cwd)
  const cwdKey = createHash('sha256').update(absoluteCwd).digest('hex').slice(0, 16)
  return path.join(getStateRoot(), 'non-git', cwdKey, filename)
}

/**
 * Resolve the repo-scoped projection DB path.
 *
 * In a git repo: `<state-root>/<repoKey>/blueprints/blueprints.db`.
 * Outside a git repo: deterministic user-state fallback keyed by absolute cwd.
 */
export function resolveBlueprintProjectionDbPath(cwd: string): string {
  try {
    return getSurfacePath(SURFACE_DB, 'repo', cwd)
  } catch (err) {
    if (err instanceof NotInGitRepoError) return nonGitStatePath(cwd, '.blueprints.db')
    throw err
  }
}

/**
 * Resolve the repo-scoped lock file for the projection DB.
 */
export function resolveBlueprintProjectionDbLockPath(cwd: string): string {
  try {
    return getSurfacePath(SURFACE_DB_LOCK, 'repo', cwd)
  } catch (err) {
    if (err instanceof NotInGitRepoError) return nonGitStatePath(cwd, '.blueprints.lock')
    throw err
  }
}

/**
 * Resolve the repo-scoped lock file for markdown mutations.
 *
 * Two worktrees of one repo share the same markdown directory under git, so
 * mutations against `_overview.md` must serialize across worktrees.
 */
export function resolveBlueprintMarkdownLockPath(cwd: string): string {
  try {
    return getSurfacePath(SURFACE_MARKDOWN_LOCK, 'repo', cwd)
  } catch (err) {
    if (err instanceof NotInGitRepoError) {
      return nonGitStatePath(cwd, '.blueprints.markdown.lock')
    }
    throw err
  }
}

export interface AcquireLockOptions {
  /** Lock-acquisition timeout. Default 5000ms. */
  readonly timeoutMs?: number
  /** Stale-lock window (proper-lockfile recovers if holder died). Default 30000ms. */
  readonly staleMs?: number
}

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_STALE_MS = 30_000

async function acquireWriteLockAt(
  lockPath: string,
  opts: AcquireLockOptions,
): Promise<() => Promise<void>> {
  mkdirSync(path.dirname(lockPath), { recursive: true })

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS

  // proper-lockfile uses exponential backoff (factor 2). Pick a retry budget
  // whose accumulated wait is ≥ timeoutMs without overshooting too far.
  const minTimeout = 50
  const maxTimeout = 500

  try {
    const release = await lockfile.lock(lockPath, {
      realpath: false,
      stale: staleMs,
      retries: {
        retries: Math.max(1, Math.ceil(Math.log2(timeoutMs / minTimeout))),
        minTimeout,
        maxTimeout,
        factor: 2,
      },
    })
    return release
  } catch (err) {
    throw new LockTimeoutError(lockPath, err)
  }
}

/**
 * Acquire the repo-scoped projection-DB write lock.
 *
 * Throws `LockTimeoutError` on failure — there is no silent "proceeds anyway"
 * escape. Read-only callers should not use this helper.
 */
export function acquireProjectionDbWriteLock(
  cwd: string,
  opts: AcquireLockOptions = {},
): Promise<() => Promise<void>> {
  return acquireWriteLockAt(resolveBlueprintProjectionDbLockPath(cwd), opts)
}

/**
 * Acquire the repo-scoped markdown-mutation write lock.
 *
 * Two worktrees of one repo share `blueprints/` under git, so cross-worktree
 * mutations must serialize here. Throws `LockTimeoutError` on failure.
 */
export function acquireMarkdownWriteLock(
  cwd: string,
  opts: AcquireLockOptions = {},
): Promise<() => Promise<void>> {
  return acquireWriteLockAt(resolveBlueprintMarkdownLockPath(cwd), opts)
}

/**
 * Run `fn` while holding the projection-DB write lock. Lock is released even
 * if `fn` throws. See `acquireProjectionDbWriteLock` for the no-silent-escape
 * guarantee.
 */
export async function withProjectionDbWriteLock<T>(
  cwd: string,
  fn: () => Promise<T> | T,
  opts: AcquireLockOptions = {},
): Promise<T> {
  const release = await acquireProjectionDbWriteLock(cwd, opts)
  try {
    return await fn()
  } finally {
    await release()
  }
}

/**
 * Run `fn` while holding the markdown-mutation write lock. Lock is released
 * even if `fn` throws.
 */
export async function withMarkdownWriteLock<T>(
  cwd: string,
  fn: () => Promise<T> | T,
  opts: AcquireLockOptions = {},
): Promise<T> {
  const release = await acquireMarkdownWriteLock(cwd, opts)
  try {
    return await fn()
  } finally {
    await release()
  }
}
