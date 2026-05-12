/**
 * Blueprint structured-store MCP server — 8 tools for the blueprint DB.
 *
 * Call `registerBlueprintTools(registrar, cwd)` from server startup.
 * It calls `coldStartIfNeeded` once then registers all 8 tools.
 *
 * All outputs honour the summary-first envelope: { summary, failures, bytes, tokensSaved }
 *
 * Platform-first sync (Task 2.1):
 *   When a SyncAdapter is available (credentials present, not disabled), mutations
 *   push a BlueprintPlatformEvent before updating local markdown/SQLite.
 *   Iron rule: AK_BLUEPRINT_PLATFORM_DISABLED=1 skips the adapter entirely — the
 *   markdown-canonical path runs byte-identically to the pre-migration behaviour.
 */
import type { ToolRegistrar } from './auto-discover.js';
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
export declare function registerBlueprintTools(registrar: ToolRegistrar, cwd: string): Promise<void>;
export {};
//# sourceMappingURL=blueprint-server.d.ts.map