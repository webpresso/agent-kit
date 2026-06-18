import { type HookStatusDetail } from '#hooks/shared/vocabulary.js';
import { type HookVendorState } from '#cli/commands/init/scaffolders/agent-hooks/manifest.js';
import { type CapabilityMatrixHost } from '#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js';
import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js';
type HookSpec = {
    readonly hook: string;
    readonly event: string;
    readonly isGuard: boolean;
};
/**
 * Derived from the IR's WP_HOOK_SPECS — the single source of truth for
 * hook bin names, events, and timeouts. `isGuard` is a status-display
 * concern derived here rather than duplicated in ir.ts.
 */
export declare const WP_HOOK_SPECS: readonly HookSpec[];
export type HostPackagedArtifactStatus = 'installed' | 'missing' | 'deferred';
export type HostActiveHookStatus = 'managed' | 'plugin-bridge' | 'not-installed';
export type HostLifecycleStatus = 'full' | 'degraded' | 'unsupported';
export interface HostSurfaceStatus {
    readonly host: CapabilityMatrixHost;
    readonly packagedArtifact: HostPackagedArtifactStatus;
    readonly activeHooks: HostActiveHookStatus;
    readonly lifecycle: HostLifecycleStatus;
    readonly required: boolean;
    readonly ownership: string;
}
type DeriveHookStatusOptions = {
    readonly hooksMap: HooksMap;
    readonly vendor: 'claude' | 'codex';
    readonly manifestExists: boolean;
    readonly vendorState?: HookVendorState;
};
/**
 * Pure logic: derive status for all hooks for a given vendor from the
 * installed hooks file. Returns one HookStatusDetail per hook spec entry.
 *
 * Sort order: event name then hook name.
 */
export declare function deriveHookStatus(options: DeriveHookStatusOptions): readonly HookStatusDetail[];
export declare function deriveHostSurfaceStatus(repoRoot: string): readonly HostSurfaceStatus[];
export declare function formatHostSurfaceStatusLine(surface: HostSurfaceStatus): string;
/**
 * Entry point called from src/cli/commands/hooks.ts case 'status':
 *
 *   case 'status':
 *     await import('#hooks/status/index.js').then(m => m.statusCommand(rest))
 */
export declare function statusCommand(argv: readonly string[]): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map