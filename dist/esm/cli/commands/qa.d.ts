import type { CAC } from 'cac';
export declare const QA_COMMAND_HELP: string;
export interface QaCommandConfig {
    readonly command: string;
    readonly args: readonly string[];
}
export declare function registerQaCommand(cli: CAC): void;
export declare function buildQaCommand(options?: {
    cwd?: string;
}): QaCommandConfig | undefined;
export declare function runQaCommand(options?: {
    cwd?: string;
}, deps?: {
    stderr?: Pick<typeof process.stderr, 'write'>;
}): Promise<{
    exitCode: number;
    entry: import('./quality-log-store.js').CliLogEntry;
}>;
//# sourceMappingURL=qa.d.ts.map