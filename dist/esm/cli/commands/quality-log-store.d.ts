export declare const CLI_LOG_COMMANDS: readonly ["test", "typecheck", "qa", "audit", "e2e", "lint", "format"];
export type CliLogCommandName = (typeof CLI_LOG_COMMANDS)[number];
export interface CliLogEntry {
    readonly id: string;
    readonly command: CliLogCommandName;
    readonly timestamp: string;
    readonly exitCode: number;
    readonly logPath: string;
    readonly options?: Record<string, unknown>;
    readonly summary?: string;
}
export declare function isCliLogCommandName(value: string): value is CliLogCommandName;
export declare function createCliLogSink(command: CliLogCommandName, cwd?: string): CliLogSink;
export interface CliLogSink {
    readonly command: CliLogCommandName;
    readonly cwd: string;
    readonly id: string;
    readonly absoluteLogPath: string;
    write(chunk: string): void;
    finalize(metadata: {
        readonly exitCode: number;
        readonly summary?: string;
        readonly options?: Record<string, unknown>;
        readonly timestamp?: string;
    }): Promise<CliLogEntry>;
}
export declare function readCliLogEntries(command: CliLogCommandName, cwd?: string): readonly CliLogEntry[];
export declare function readCliLogEntry(command: CliLogCommandName, ordinal?: number, cwd?: string): CliLogEntry | undefined;
//# sourceMappingURL=quality-log-store.d.ts.map