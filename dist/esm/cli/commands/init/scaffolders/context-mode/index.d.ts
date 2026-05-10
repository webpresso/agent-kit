import { spawnSync } from 'node:child_process';
import { type MergeOptions, type MergeResult } from '#cli/commands/init/merge';
export interface EnsureContextModeInput {
    repoRoot: string;
    options: MergeOptions;
    spawn?: typeof spawnSync;
    codexConfigPath?: string;
    codexHooksPath?: string;
    opencodeConfigPath?: string;
}
export type EnsureContextModeResult = {
    codexMcp: MergeResult;
    codexHooks: MergeResult;
    opencodeConfig: MergeResult;
    installed: boolean;
};
export declare function upsertContextModeMcpServer(raw: string): string;
export declare function patchCodexContextModeHooks(existing: Record<string, unknown>): Record<string, unknown>;
export declare function patchOpenCodeContextModeConfig(existing: Record<string, unknown>, agentKitCommand?: string[]): Record<string, unknown>;
export declare function ensureContextMode(input: EnsureContextModeInput): EnsureContextModeResult;
//# sourceMappingURL=index.d.ts.map