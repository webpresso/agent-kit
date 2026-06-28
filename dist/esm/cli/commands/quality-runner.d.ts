import { type CliLogCommandName, type CliLogEntry } from "./quality-log-store.js";
export interface CliSpawnCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd?: string;
    readonly env?: Record<string, string>;
    readonly runtimeProfile?: string;
}
export interface CliRunCommandOptions {
    readonly commandName: CliLogCommandName;
    readonly commands: readonly CliSpawnCommand[];
    readonly cwd?: string;
    readonly preambleLines?: readonly string[];
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
    readonly summary: (result: {
        readonly exitCode: number;
        readonly timedOut: boolean;
        readonly aborted: boolean;
    }) => string;
    readonly metadataOptions?: Record<string, unknown>;
}
export interface CliRunCommandResult {
    readonly exitCode: number;
    readonly timedOut: boolean;
    readonly aborted: boolean;
    readonly entry: CliLogEntry;
}
export declare function runCliCommandSequence(options: CliRunCommandOptions): Promise<CliRunCommandResult>;
export interface EmitCliCommandOutputOptions {
    readonly entry: CliLogEntry;
    readonly summary: string;
    readonly passed: boolean;
    readonly full?: boolean;
    readonly rawMode?: boolean;
    readonly toolName: string;
    readonly stdout?: Pick<typeof process.stdout, "write">;
}
export declare function emitCliCommandOutput(options: EmitCliCommandOutputOptions): void;
export interface LoggedChildResult {
    readonly exitCode: number;
    readonly timedOut: boolean;
    readonly aborted: boolean;
}
export interface LoggedChildOptions {
    readonly cwd?: string;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
    readonly write: (chunk: string) => void;
}
export declare function runLoggedChildCommand(command: CliSpawnCommand, options: LoggedChildOptions): Promise<LoggedChildResult>;
//# sourceMappingURL=quality-runner.d.ts.map