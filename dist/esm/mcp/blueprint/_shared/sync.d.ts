/**
 * Minimal platform sync surface needed by blueprint-server handlers.
 *
 * The production factory creates a BlueprintSyncClient + ReplicaManager pair.
 * Tests inject a mock via `_setSyncAdapterFactory`.
 *
 * Keeping this interface here (rather than importing BlueprintPlatformClient
 * directly) avoids coupling blueprint-server to the client implementation and
 * keeps the module testable without live credentials.
 */
export interface SyncAdapter {
    pushEvent(event: {
        readonly eventId: string;
        readonly repoId: string;
        readonly occurredAt: string;
        readonly type: 'task.status_changed';
        readonly payload: {
            readonly type: 'task.status_changed';
            readonly blueprintSlug: string;
            readonly taskId: string;
            readonly fromStatus: string;
            readonly toStatus: string;
        };
    } | {
        readonly eventId: string;
        readonly repoId: string;
        readonly occurredAt: string;
        readonly type: 'blueprint.status_changed';
        readonly payload: {
            readonly type: 'blueprint.status_changed';
            readonly slug: string;
            readonly fromStatus: string;
            readonly toStatus: string;
        };
    } | {
        readonly eventId: string;
        readonly repoId: string;
        readonly occurredAt: string;
        readonly type: 'blueprint.finalized';
        readonly payload: {
            readonly type: 'blueprint.finalized';
            readonly slug: string;
        };
    } | {
        readonly eventId: string;
        readonly repoId: string;
        readonly occurredAt: string;
        readonly type: 'blueprint.created';
        readonly payload: {
            readonly type: 'blueprint.created';
            readonly slug: string;
            readonly title: string;
            readonly complexity: string;
            readonly status: string;
        };
    }): Promise<void>;
    ensureFresh(opts?: {
        readonly slug?: string;
    }): Promise<void>;
}
type SyncAdapterFactory = () => SyncAdapter | null;
/**
 * Override the adapter factory — for tests only.
 * Pass `null` to restore the production default.
 *
 * @internal
 */
export declare function _setSyncAdapterFactory(factory: SyncAdapterFactory | null): void;
/**
 * Resolve the sync adapter for the current request.
 *
 * Iron rule: returns `null` when `WP_BLUEPRINT_PLATFORM_DISABLED=1` regardless
 * of any injected factory — the caller must skip all platform operations.
 *
 * @param cwd - repo working directory, used to locate the replica DB file.
 */
export declare function resolveSyncAdapter(cwd: string): Promise<SyncAdapter | null>;
export declare function runPlatformMutationSync(adapter: SyncAdapter | null, options: {
    readonly label: string;
    readonly event?: Parameters<SyncAdapter['pushEvent']>[0];
    readonly ensureFreshSlug?: string;
}): Promise<void>;
export {};
//# sourceMappingURL=sync.d.ts.map