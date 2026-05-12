export type LockScope = 'repo' | 'worktree' | 'user';
export declare class NotInGitRepoError extends Error {
    readonly cwd: string;
    constructor(cwd: string, cause?: unknown);
}
export declare function getStateRoot(): string;
export declare function getRepoKey(): string;
export declare function getWorktreeKey(): string;
export declare function getSurfacePath(name: string, scope: LockScope): string;
export declare function withLock<T>(scope: LockScope, fn: () => Promise<T> | T): Promise<T>;
export declare function _clearCacheForTests(): void;
//# sourceMappingURL=state-root.d.ts.map