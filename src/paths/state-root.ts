import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import envPaths from 'env-paths'
import lockfile from 'proper-lockfile'

export type LockScope = 'repo' | 'worktree' | 'user'

export class NotInGitRepoError extends Error {
  readonly cwd: string

  constructor(cwd: string, cause?: unknown) {
    super(`Not inside a git repository (cwd=${cwd})`)
    this.name = 'NotInGitRepoError'
    this.cwd = cwd
    if (cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = cause
    }
  }
}

let cachedStateRoot: string | null = null
let cachedRepoKey: string | null = null
let cachedWorktreeKey: string | null = null

function resolveCwd(): string {
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
}

function runGit(args: readonly string[], cwd: string): string {
  try {
    const out = execFileSync('git', [...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return out.trim()
  } catch (error) {
    throw new NotInGitRepoError(cwd, error)
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function getStateRoot(): string {
  if (cachedStateRoot !== null) return cachedStateRoot
  const paths = envPaths('webpresso-agent-kit', { suffix: '' })
  const root = paths.data
  cachedStateRoot = root
  return root
}

export function getRepoKey(): string {
  if (cachedRepoKey !== null) return cachedRepoKey
  const cwd = resolveCwd()
  const commonDir = runGit(['rev-parse', '--git-common-dir'], cwd)
  const absolute = realpathSync(commonDir)
  cachedRepoKey = sha256Hex(absolute).slice(0, 16)
  return cachedRepoKey
}

export function getWorktreeKey(): string {
  if (cachedWorktreeKey !== null) return cachedWorktreeKey
  const cwd = resolveCwd()
  const topLevel = runGit(['rev-parse', '--show-toplevel'], cwd)
  const absolute = realpathSync(topLevel)
  cachedWorktreeKey = sha256Hex(absolute).slice(0, 8)
  return cachedWorktreeKey
}

export function getSurfacePath(name: string, scope: LockScope): string {
  const root = getStateRoot()
  if (scope === 'user') {
    return join(root, name)
  }
  const repoKey = getRepoKey()
  if (scope === 'worktree') {
    const wtKey = getWorktreeKey()
    return join(root, repoKey, 'worktree', wtKey, name)
  }
  return join(root, repoKey, name)
}

export async function withLock<T>(scope: LockScope, fn: () => Promise<T> | T): Promise<T> {
  if (scope === 'user') {
    throw new Error('withLock does not support user-global scope; use repo or worktree')
  }
  const lockTarget = getSurfacePath('.lock', scope)
  const release = await lockfile.lock(lockTarget, {
    realpath: false,
    retries: { retries: 5, minTimeout: 50, maxTimeout: 500, factor: 2 },
  })
  try {
    return await fn()
  } finally {
    await release()
  }
}

export function _clearCacheForTests(): void {
  cachedStateRoot = null
  cachedRepoKey = null
  cachedWorktreeKey = null
}
