import type { CAC } from 'cac';
export declare const TYPECHECK_COMMAND_HELP: string;
export interface TypecheckOptions {
    readonly pretty?: boolean;
    readonly cwd?: string;
    readonly files?: readonly string[];
    readonly packages?: readonly string[];
}
export interface TypecheckCommandConfig {
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Record<string, string>;
}
export declare function registerTypecheckCommand(cli: CAC): void;
export declare function buildTypecheckCommand(options?: TypecheckOptions): TypecheckCommandConfig;
export declare function runTypecheckCommand(options?: TypecheckOptions): Promise<{
    exitCode: number;
    entry: import('./quality-log-store.js').CliLogEntry;
}>;
//# sourceMappingURL=typecheck.d.ts.map