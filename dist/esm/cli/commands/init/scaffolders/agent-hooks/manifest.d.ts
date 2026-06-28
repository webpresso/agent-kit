/**
 * Hooks manifest writer — records what wp-* hooks are installed per vendor so
 * the doctor and status command can compare against it.
 *
 * The manifest is written to `.webpresso/hooks-manifest.json` after every
 * `wp setup`. It is intentionally gitignored — it is a local install record,
 * not a source-of-truth document.
 */
import { type HooksMap } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
export declare const HOOK_MANIFEST_VENDORS: readonly ["claude", "codex"];
export type HookManifestVendor = (typeof HOOK_MANIFEST_VENDORS)[number];
export type HookVendorState = "enabled" | "disabled";
export type HookVendorStateMap = Record<HookManifestVendor, HookVendorState>;
export type HooksManifest = {
    readonly version: 1;
    readonly generatedAt: string;
    readonly claude: HooksMap;
    readonly codex: HooksMap;
    readonly vendorState: HookVendorStateMap;
};
export declare const MANIFEST_PATH = ".webpresso/hooks-manifest.json";
/**
 * Write the hooks manifest to disk at `<repoRoot>/.webpresso/hooks-manifest.json`.
 * Creates the `.webpresso/` directory if it does not exist.
 */
export declare function writeHooksManifest(repoRoot: string, claude: HooksMap, codex: HooksMap, vendorState?: HookVendorStateMap): void;
/**
 * Read the hooks manifest from disk.
 * Returns null if the file does not exist or cannot be parsed.
 */
export declare function readHooksManifest(repoRoot: string): HooksManifest | null;
export type HookVerdict = "ok" | "missing" | "unknown";
export type HookDiff = {
    readonly event: string;
    readonly command: string;
    readonly verdict: HookVerdict;
    readonly vendor: "claude" | "codex";
};
/**
 * Compare installed hooks (from disk) against the manifest.
 * Returns per-hook 3-way verdicts:
 *   'ok'      — in manifest and installed
 *   'missing' — in manifest but not installed
 *   'unknown' — installed but not in manifest (hand-edited?)
 */
export declare function diffHooksManifest(manifest: HooksManifest, current: {
    claude: HooksMap;
    codex: HooksMap;
}): readonly HookDiff[];
export declare function withHookVendorState(manifest: HooksManifest, vendors: readonly HookManifestVendor[], state: HookVendorState): HooksManifest;
//# sourceMappingURL=manifest.d.ts.map