export interface SecretGateCommand {
    readonly command: string;
    readonly args: readonly string[];
}
export interface SecretGateCommandOptions {
    readonly maxOutputBytes?: number;
    readonly runner?: string;
    readonly envProfile?: string;
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
}
export interface SecretGateRunResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
    readonly aborted: boolean;
    readonly signal: NodeJS.Signals | null;
}
export declare function buildSecretGateCommand(options: SecretGateCommandOptions): SecretGateCommand;
export declare function runSecretGateCommand(options: SecretGateCommandOptions): Promise<SecretGateRunResult>;
//# sourceMappingURL=runner.d.ts.map