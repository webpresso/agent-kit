import type { CodexAppServerApi, CommandHookMetadata } from '#codex/app-server/types.js';
export interface SyncCodexHookTrustInput {
    readonly repoRoot: string;
    /**
     * Absolute path to the Codex config.toml that holds [hooks].state trust entries.
     * Defaults to ~/.codex/config.toml (honouring $CODEX_HOME).
     * Must point to a TOML config file, NOT to hooks.json — writing `hooks.state` into
     * hooks.json causes Codex's deny_unknown_fields HooksFile parser to reject it entirely.
     */
    readonly codexConfigFilePath?: string;
    readonly expectedSourcePaths?: readonly string[];
    readonly hookDescription?: string;
    readonly selectHook?: (metadata: unknown, expectedSourcePaths: readonly string[]) => metadata is CommandHookMetadata;
}
export declare function defaultCodexConfigFilePath(): string;
export type CodexTrustStateUpdate = Record<string, {
    enabled: true;
    trusted_hash: string;
}>;
export type SyncCodexHookTrustResult = {
    readonly ok: true;
    readonly trustedKeys: readonly string[];
    readonly state: CodexTrustStateUpdate;
} | {
    readonly ok: false;
    readonly reason: 'no-webpresso-hooks-found' | 'hooks-list-failed' | 'config-write-failed' | 'verification-failed';
    readonly message: string;
};
export declare function syncCodexHookTrustWithAppServer(api: CodexAppServerApi, input: SyncCodexHookTrustInput): Promise<SyncCodexHookTrustResult>;
export declare function defaultExpectedCodexHookSourcePaths(repoRoot: string): readonly string[];
export declare function buildCodexTrustStateUpdate(hooks: readonly CommandHookMetadata[]): CodexTrustStateUpdate;
//# sourceMappingURL=codex-trust-sync.d.ts.map