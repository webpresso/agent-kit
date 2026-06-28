export declare const MANAGED_WORKTREE_ROOT_RELATIVE = ".agent/worktrees";
export interface RepoNamespaceInput {
    readonly originUrl?: string | null;
    readonly repoRoot: string;
}
export interface WorktreeLocationOptions {
    readonly homeDir?: string;
    readonly originUrl?: string | null;
}
export declare function resolveManagedWorktreeRoot(homeDir?: string): string;
export declare function deriveRepoNamespace(input: RepoNamespaceInput): string;
/**
 * Resolve the agent-kit managed root for a repository checkout.
 *
 * V1 is intentionally fixed under the user-global root: no repository or user
 * override is accepted for managed worktrees.
 */
export declare function resolveWorktreeRoot(repoRoot: string, options?: WorktreeLocationOptions): string;
export declare function resolveBlueprintWorktreeRoot(repoRoot: string, slug: string, options?: WorktreeLocationOptions): string;
export declare function resolveOwnerWorktreePath(repoRoot: string, slug: string, options?: WorktreeLocationOptions): string;
export declare function resolveScratchWorktreePath(repoRoot: string, slug: string, lane: string, id: string, options?: WorktreeLocationOptions): string;
/**
 * Resolve a generated child worktree path below the shared worktree root.
 */
export declare function resolveGeneratedWorktreePath(worktreeRoot: string, slug: string): string;
//# sourceMappingURL=location.d.ts.map