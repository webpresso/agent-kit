import type { CommandHookMetadata } from '#codex/app-server/types.js';
export declare const KNOWN_WEBPRESSO_CODEX_BINS: readonly ["wp-sessionstart-routing", "wp-check-dev-link", "wp-pretool-guard", "wp-post-tool", "wp-guard-switch", "wp-stop-qa"];
export interface CodexHookOwnershipMetadata {
    readonly isManaged?: unknown;
    readonly handlerType?: unknown;
    readonly pluginId?: unknown;
    readonly sourcePath?: unknown;
    readonly command?: unknown;
}
export declare function isWebpressoOwnedCodexHook(metadata: unknown, expectedSourcePaths: readonly string[]): metadata is CommandHookMetadata;
//# sourceMappingURL=codex-ownership.d.ts.map