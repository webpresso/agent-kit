export interface SecretGateCommand {
    readonly command: string;
    readonly args: readonly string[];
}
export interface SecretGateCommandOptions {
    readonly maxOutputBytes?: number;
    readonly sink?: string;
    readonly profile?: string;
    readonly envProfile?: string;
    readonly secretEnvProfile?: string;
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly forceSecretGate?: boolean;
}
export interface SecretGateRunResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
    readonly aborted: boolean;
    readonly signal: NodeJS.Signals | null;
}
export declare const SECRET_GATE_FORCE_KILL_GRACE_MS = 5000;
export declare function isSecretGateRuntimeProfile(value: string | undefined): boolean;
export declare function buildSecretGateCommand(options: SecretGateCommandOptions): SecretGateCommand;
export declare function runSecretGateCommand(options: SecretGateCommandOptions): Promise<SecretGateRunResult>;
//# sourceMappingURL=runner.d.ts.map