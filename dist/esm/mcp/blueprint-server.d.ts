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
 *   Iron rule: WP_BLUEPRINT_PLATFORM_DISABLED=1 skips the adapter entirely — the
 *   markdown-canonical path runs byte-identically to the pre-migration behaviour.
 */
import { type ProjectResolver } from "#project-resolver.js";
import type { ToolRegistrar } from "./auto-discover.js";
import { _setSyncAdapterFactory, type SyncAdapter } from "#mcp/blueprint/_shared/sync";
export { _setSyncAdapterFactory };
export type { SyncAdapter };
export declare function registerBlueprintTools(registrar: ToolRegistrar, cwd: string, projectResolver?: ProjectResolver): Promise<void>;
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
    readonly projectResolver?: ProjectResolver;
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
//# sourceMappingURL=blueprint-server.d.ts.map