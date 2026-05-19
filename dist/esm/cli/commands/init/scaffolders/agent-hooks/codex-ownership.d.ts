import type { CommandHookMetadata } from '#codex/app-server/types.js';
export declare const KNOWN_AGENT_KIT_CODEX_BINS: readonly ["ak-sessionstart-routing", "ak-check-dev-link", "ak-pretool-guard", "ak-post-tool", "ak-guard-switch", "ak-stop-qa"];
export interface CodexHookOwnershipMetadata {
    readonly isManaged?: unknown;
    readonly handlerType?: unknown;
    readonly pluginId?: unknown;
    readonly sourcePath?: unknown;
    readonly command?: unknown;
}
export declare function isAgentKitOwnedCodexHook(metadata: unknown, expectedSourcePaths: readonly string[]): metadata is CommandHookMetadata;
//# sourceMappingURL=codex-ownership.d.ts.map