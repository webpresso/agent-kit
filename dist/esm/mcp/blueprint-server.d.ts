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
/**
 * Options for {@link registerBlueprintServer}.
 *
 * @property cwd                Repo working directory (defaults to process.cwd()).
 * @property existingToolNames  Names of tools already registered by the
 *                              auto-discover step. Registration HARD-FAILS on
 *                              collision (F13/E15) — silent shadowing would
 *                              hide name drift from CI.
 * @property getMcpRoots        Lazy callback that returns the current MCP
 *                              client roots. Catch unsupported-capability
 *                              errors *inside* this callback or let them
 *                              throw — `wp_blueprint_projects` degrades
 *                              gracefully to current-cwd + warning.
 * @property onRootsListChanged Optional callback to install a notification
 *                              handler for `RootsListChangedNotificationSchema`.
 *                              When the client emits the notification, invoke
 *                              the callback (no args) and the roots cache will
 *                              be invalidated. Callers wire this via
 *                              `server.setNotificationHandler(...)` (F5).
 */
export interface RegisterBlueprintServerOptions {
    readonly cwd?: string;
    readonly existingToolNames: ReadonlySet<string>;
    readonly getMcpRoots?: () => Promise<{
        readonly roots: ReadonlyArray<{
            readonly uri: string;
            readonly name?: string;
        }>;
    }>;
    readonly onRootsListChanged?: (handler: () => void) => void;
}
/**
 * Wire the blueprint structured-store tools into the main MCP server.
 *
 * Single integration point (F13/E15): call this once from `createServer` AFTER
 * `auto-discover` finishes so tool-name collisions surface as a registration
 * error rather than silent shadow. Adds `wp_blueprint_projects` on top of the
 * 8 existing tools.
 *
 * Roots handling (F5):
 * - Roots are looked up lazily via `getMcpRoots` (callers pass a thunk that
 *   calls `server.listRoots()`). If the client does not support roots, the
 *   callback throws `assertClientCapability` — that throw is caught here, the
 *   tool result includes an `unsupported_roots` warning, and the current
 *   project still resolves from cwd.
 * - `onRootsListChanged` lets the caller hook a notification handler so the
 *   cached roots invalidate on the next read.
 */
export declare function registerBlueprintServer(registrar: ToolRegistrar, options: RegisterBlueprintServerOptions): Promise<void>;
export {};
//# sourceMappingURL=blueprint-server.d.ts.map