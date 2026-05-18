import type { CodexAppServerApi, CommandHookMetadata } from '#codex/app-server/types.js';
export interface SyncCodexHookTrustInput {
    readonly repoRoot: string;
    readonly expectedSourcePaths?: readonly string[];
    readonly hookDescription?: string;
    readonly selectHook?: (metadata: unknown, expectedSourcePaths: readonly string[]) => metadata is CommandHookMetadata;
}
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
    readonly reason: 'no-agent-kit-hooks-found' | 'hooks-list-failed' | 'config-write-failed' | 'verification-failed';
    readonly message: string;
};
export declare function syncCodexHookTrustWithAppServer(api: CodexAppServerApi, input: SyncCodexHookTrustInput): Promise<SyncCodexHookTrustResult>;
export declare function defaultExpectedCodexHookSourcePaths(repoRoot: string): readonly string[];
export declare function buildCodexTrustStateUpdate(hooks: readonly CommandHookMetadata[]): CodexTrustStateUpdate;
//# sourceMappingURL=codex-trust-sync.d.ts.map