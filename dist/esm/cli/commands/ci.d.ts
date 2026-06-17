import type { CAC } from 'cac';
import type { SecretGateCommandOptions, SecretGateRunResult } from '#secret-gate/runner.js';
import { type CiActEventName } from '#ci/act-runner.js';
export declare const DEFAULT_CI_ACT_TIMEOUT_MS: number;
export declare const MAX_CI_ACT_TIMEOUT_MS: number;
export declare const CI_COMMAND_HELP: string;
export interface CiActOptions {
    readonly workflow?: string;
    readonly workflowPath?: string;
    readonly job?: string;
    readonly eventName?: CiActEventName;
    readonly eventPath?: string;
    readonly envProfile?: string;
    readonly containerArchitecture?: string;
    readonly platformImage?: string;
    readonly execute?: boolean;
    readonly timeoutMs?: number;
}
export interface CiCommandConfig {
    readonly command: string;
    readonly args: readonly string[];
}
export interface CiCommandDeps {
    readonly cwd?: string;
    readonly run?: (options: SecretGateCommandOptions) => Promise<SecretGateRunResult>;
    readonly stdout?: Pick<NodeJS.WriteStream, 'write'>;
    readonly stderr?: Pick<NodeJS.WriteStream, 'write'>;
}
export declare function registerCiCommand(cli: CAC): void;
export declare function buildCiActCommand(options?: CiActOptions, cwd?: string): CiCommandConfig;
export declare function validateCiActCommand(..._legacyArgs: readonly unknown[]): string | null;
export declare function runCiActCommand(options?: CiActOptions, deps?: CiCommandDeps): Promise<number>;
export declare function normalizeCiActTimeoutMs(value: number | undefined): number;
export declare function parseCiActTimeoutMs(value: unknown): number | undefined;
//# sourceMappingURL=ci.d.ts.map