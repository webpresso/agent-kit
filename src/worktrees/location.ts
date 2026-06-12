import { basename, dirname, join } from 'node:path'

/**
 * Resolve the shared sibling directory that holds generated worktrees for a
 * repository checkout.
 *
 * Example: `/repos/webpresso` -> `/repos/webpresso_worktrees`
 */
export function resolveWorktreeRoot(repoRoot: string): string {
  return join(dirname(repoRoot), `${basename(repoRoot)}_worktrees`)
}

/**
 * Resolve a generated child worktree path below the shared worktree root.
 */
export function resolveGeneratedWorktreePath(worktreeRoot: string, slug: string): string {
  return join(worktreeRoot, slug)
}
