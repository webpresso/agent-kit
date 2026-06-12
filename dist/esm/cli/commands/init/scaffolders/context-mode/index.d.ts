import { spawnSync } from 'node:child_process';
import { type MergeOptions, type MergeResult } from '#cli/commands/init/merge';
import { type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner';
export interface EnsureContextModeInput {
    repoRoot: string;
    options: MergeOptions;
    spawn?: typeof spawnSync;
    codexConfigPath?: string;
    claudeSettingsPath?: string;
    opencodeConfigPath?: string;
    pinFilePath?: string;
    nodeBinary?: string;
    strict?: boolean;
    spinnerFactory?: SpinnerFactory;
}
export type EnsureContextModeResult = {
    codexFeatures: MergeResult;
    codexMcpServer: MergeResult;
    codexGlobalHooks: MergeResult;
    claudeGlobalHooks: MergeResult;
    opencodeConfig: MergeResult;
    installed: boolean;
};
export declare function upsertCodexContextModeFeatures(raw: string): string;
export declare function patchOpenCodeContextModeConfig(existing: Record<string, unknown>, agentKitCommand?: string[]): Record<string, unknown>;
export declare function ensureContextMode(input: EnsureContextModeInput): EnsureContextModeResult;
//# sourceMappingURL=index.d.ts.map