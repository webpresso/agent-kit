import type { CAC } from 'cac';
import type { SpawnSyncReturns } from 'node:child_process';
export declare const QA_COMMAND_HELP: string;
export interface QaCommandConfig {
    readonly command: string;
    readonly args: readonly string[];
}
export interface QaCommandDeps {
    readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
    readonly stderr?: Pick<typeof process.stderr, 'write'>;
}
export declare function registerQaCommand(cli: CAC): void;
export declare function buildQaCommand(options?: {
    cwd?: string;
}): QaCommandConfig | undefined;
export declare function runQaCommand(options?: {
    cwd?: string;
}, deps?: QaCommandDeps): number;
//# sourceMappingURL=qa.d.ts.map