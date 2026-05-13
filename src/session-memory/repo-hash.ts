/**
 * repoHash — first 16 chars of SHA-256 of `git rev-parse --show-toplevel` output.
 * Stable across sessions, unique per repo (64 bits: collision probability negligible).
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

/**
 * Compute a 16-character hex hash for the given repo root path.
 * Exposed for testing.
 */
export function hashRepoRoot(repoRoot: string): string {
  return createHash('sha256').update(repoRoot, 'utf8').digest('hex').slice(0, 16)
}

/**
 * Compute the repo hash for the current working directory.
 * Falls back to hashing the cwd string if git is unavailable.
 */
export function computeRepoHash(cwd?: string): string {
  const workDir = cwd ?? process.cwd()
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: workDir,
    encoding: 'utf8',
    timeout: 3_000,
  })
  if (result.error || result.status !== 0) {
    // Fallback: hash the cwd itself
    return hashRepoRoot(workDir)
  }
  const repoRoot = result.stdout.trim()
  return hashRepoRoot(repoRoot)
}
