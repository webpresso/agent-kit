/**
 * Resolve the shared sibling directory that holds generated worktrees for a
 * repository checkout.
 *
 * Example: `/repos/webpresso` -> `/repos/webpresso_worktrees`
 */
export declare function resolveWorktreeRoot(repoRoot: string): string;
/**
 * Resolve a generated child worktree path below the shared worktree root.
 */
export declare function resolveGeneratedWorktreePath(worktreeRoot: string, slug: string): string;
//# sourceMappingURL=location.d.ts.map