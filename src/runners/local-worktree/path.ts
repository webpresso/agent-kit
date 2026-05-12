import { join } from 'node:path'

/**
 * Generates a unique worktree path for the given task.
 *
 * Two calls with the same taskId return different paths because a UUID is
 * appended, making each invocation distinct.
 *
 * @returns `<baseDir>/.ak-worktrees/<taskId>-<uuid>`
 */
export function generateWorktreePath(baseDir: string, taskId: string): string {
  const uuid = crypto.randomUUID()
  return join(baseDir, '.ak-worktrees', `${taskId}-${uuid}`)
}
