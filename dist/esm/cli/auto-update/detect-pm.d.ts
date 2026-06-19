/**
 * Install-topology detection for the auto-update installer.
 *
 * Agent Kit is distributed as a published package installed by Vite+ (`vp`).
 * Auto-update intentionally has one supported consumer lane: refresh the global
 * Vite+ install with `vp install -g @webpresso/agent-kit`. Local dev/source
 * execution is explicit via `WP_FORCE_SOURCE=1` and is not an install topology.
 */
import { type GlobalCapableVpCommandInput } from '#cli/global-vp.js';
export type InstallTopology = 'vp';
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
 * Vite+ is the supported package-manager surface for global Agent Kit
 * consumers. Do not reintroduce npm/pnpm/homebrew/local-bin variants here.
 */
export declare function buildVpGlobalInstallCommand(vpCommand?: GlobalCapableVpCommandInput): [string, ...string[]];
export declare function formatLegacyCommandReplacementMessage(legacyCommand: string): string | null;
/**
 * Detect the install topology that owns the running `wp` / agent-kit binary.
 */
export declare function detect(env: NodeJS.ProcessEnv, argv0: string, resolveVpCommand?: () => GlobalCapableVpCommandInput | null): DetectResult;
/**
 * Parse the `npm_config_user_agent` string. Only Vite+ (`vp`) is accepted as a
 * supported global-install topology. Other package managers may execute project
 * installs, but they do not own Agent Kit's global consumer install.
 */
export declare function parseUserAgent(userAgent: string): InstallTopology | null;
/**
 * Look for the only supported global install store marker.
 */
export declare function matchStoreMarker(realpath: string): InstallTopology | null;
/**
 * Detect unsupported shim/global-manager layouts and provide the supported fix.
 */
export declare function detectShim(realpath: string): string | null;
/**
 * Vite+ global installs are the only accepted consumer global topology.
 * Exported for testability and for legacy callers that still ask the question.
 */
export declare function confirmInstalledGlobally(realpath: string, _env: NodeJS.ProcessEnv): boolean;
//# sourceMappingURL=detect-pm.d.ts.map