export interface PruneProjectionArtifactsOptions {
    readonly now?: number;
    readonly preserveDbPath?: string;
    readonly stateRoot?: string;
    readonly ttlMs?: number;
}
export interface PruneProjectionArtifactsResult {
    readonly pruned: number;
}
export declare function pruneProjectionArtifacts(options?: PruneProjectionArtifactsOptions): PruneProjectionArtifactsResult;
//# sourceMappingURL=gc.d.ts.map