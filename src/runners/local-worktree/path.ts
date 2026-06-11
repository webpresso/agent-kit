import { resolveGeneratedWorktreePath, resolveWorktreeRoot } from '#worktrees/location.js'

/**
 * Generates a unique worktree path for the given task.
 *
 * Two calls with the same taskId return different paths because a UUID is
 * appended, making each invocation distinct.
 *
 * @returns `<parent>/<repo>_worktrees/<taskId>-<uuid>`
 */
export function generateWorktreePath(baseDir: string, taskId: string): string {
  const uuid = crypto.randomUUID()
  return resolveGeneratedWorktreePath(resolveWorktreeRoot(baseDir), `${taskId}-${uuid}`)
}
