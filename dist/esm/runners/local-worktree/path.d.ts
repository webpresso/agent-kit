/**
 * Generates a unique worktree path for the given task.
 *
 * Two calls with the same taskId return different paths because a UUID is
 * appended, making each invocation distinct.
 *
 * @returns `<baseDir>/.ak-worktrees/<taskId>-<uuid>`
 */
export declare function generateWorktreePath(baseDir: string, taskId: string): string;
//# sourceMappingURL=path.d.ts.map