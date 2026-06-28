export type LockScope = "repo" | "worktree" | "user";
export declare class NotInGitRepoError extends Error {
    readonly cwd: string;
    constructor(cwd: string, cause?: unknown);
}
export declare function getStateRoot(): string;
export declare function getRepoKey(): string;
export declare function getWorktreeKey(): string;
/**
 * Resolve the on-disk path for a named state surface.
 *
 * @param cwd  Optional project directory. When provided, git context is
 *             derived from that directory instead of process.cwd()/
 *             CLAUDE_PROJECT_DIR. Callers that receive a `cwd` parameter
 *             (e.g. coldStartIfNeeded, auditMemoryRotation) should forward
 *             it here so each project's state lands under its own key.
 *             If `cwd` is not a git repo, NotInGitRepoError is thrown and
 *             the caller falls back to the cwd-relative legacy path.
 */
export declare function getSurfacePath(name: string, scope: LockScope, cwd?: string): string;
export declare function withLock<T>(scope: LockScope, fn: () => Promise<T> | T): Promise<T>;
export declare function _clearCacheForTests(): void;
//# sourceMappingURL=state-root.d.ts.map