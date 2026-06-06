import { spawnSync } from 'node:child_process';
import { type MergeOptions, type MergeResult } from '#cli/commands/init/merge';
import { type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner';
export interface EnsureContextModeInput {
    repoRoot: string;
    options: MergeOptions;
    spawn?: typeof spawnSync;
    codexConfigPath?: string;
    opencodeConfigPath?: string;
    pinFilePath?: string;
    strict?: boolean;
    spinnerFactory?: SpinnerFactory;
    globalInstall?: boolean;
}
export type EnsureContextModeResult = {
    codexFeatures: MergeResult;
    codexGlobalHooks: MergeResult;
    opencodeConfig: MergeResult;
    installed: boolean;
};
export declare function upsertCodexContextModeFeatures(raw: string): string;
export declare function patchOpenCodeContextModeConfig(existing: Record<string, unknown>, agentKitCommand?: string[]): Record<string, unknown>;
export declare function ensureContextMode(input: EnsureContextModeInput): EnsureContextModeResult;
//# sourceMappingURL=index.d.ts.map