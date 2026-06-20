/**
 * Install-topology detection for the auto-update installer.
 *
 * Agent Kit is distributed as a published package. Auto-update supports the
 * historical Vite+ global lane and the npm global lane used by public install
 * docs. Local dev/source execution is explicit via `WP_FORCE_SOURCE=1` and is
 * not an install topology.
 */
import { type GlobalCapableVpCommandInput } from '#cli/global-vp.js';
export type InstallTopology = 'vp' | 'npm';
export interface DetectSuccess {
    topology: InstallTopology;
    command: string[];
}
export interface DetectAbort {
    abort: string;
}
export type DetectResult = DetectSuccess | DetectAbort;
export declare const PUBLIC_PACKAGE_NAME = "@webpresso/agent-kit";
export declare const PUBLIC_NPM_REGISTRY = "https://registry.npmjs.org";
/**
 * Canonical global-install command for the public agent-kit.
 *
 * Vite+ remains the historical global install surface. `wp` now bundles the
 * Vite+ runner, so this command can be built from either a global `vp` or the
 * managed package dependency.
 */
export declare function buildVpGlobalInstallCommand(vpCommand?: GlobalCapableVpCommandInput): [string, ...string[]];
export declare function buildNpmGlobalInstallCommand(npmCommand?: string): [string, ...string[]];
export declare function formatLegacyCommandReplacementMessage(legacyCommand: string): string | null;
/**
 * Detect the install topology that owns the running `wp` / agent-kit binary.
 */
export declare function detect(env: NodeJS.ProcessEnv, argv0: string, resolveVpCommand?: () => GlobalCapableVpCommandInput | null, resolveNpmCommand?: () => string): DetectResult;
/**
 * Parse the `npm_config_user_agent` string for supported global install
 * topologies. Other package managers may execute project installs, but they do
 * not own Agent Kit's global consumer install.
 */
export declare function parseUserAgent(userAgent: string): InstallTopology | null;
/**
 * Look for supported global install store markers.
 */
export declare function matchStoreMarker(realpath: string): InstallTopology | null;
/**
 * Detect unsupported shim/global-manager layouts and provide the supported fix.
 */
export declare function detectShim(realpath: string): string | null;
/**
 * Supported consumer global topologies.
 * Exported for testability and for legacy callers that still ask the question.
 */
export declare function confirmInstalledGlobally(realpath: string, _env: NodeJS.ProcessEnv): boolean;
export declare function resolveBundledVpCommand(): GlobalCapableVpCommandInput | null;
//# sourceMappingURL=detect-pm.d.ts.map