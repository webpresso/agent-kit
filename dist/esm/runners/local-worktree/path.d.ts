/**
 * Generates an agent-kit managed scratch worktree path for the given task.
 *
 * Local worktree runners are non-owner sandboxes, so they live under the hidden
 * `.scratch/` lane for the task/blueprint identifier instead of creating a
 * visible sibling checkout.
 */
export declare function generateWorktreePath(repoRoot: string, taskId: string): string;
//# sourceMappingURL=path.d.ts.map