/**
 * Generates a unique worktree path for the given task.
 *
 * Two calls with the same taskId return different paths because a UUID is
 * appended, making each invocation distinct.
 *
 * @returns `<parent>/<repo>_worktrees/<taskId>-<uuid>`
 */
export declare function generateWorktreePath(repoRoot: string, taskId: string): string;
//# sourceMappingURL=path.d.ts.map