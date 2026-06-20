import type { CAC } from 'cac';
export declare const LINT_COMMAND_HELP: string;
export declare function registerLintCommand(cli: CAC): void;
export declare function buildLintCommand(options?: {
    readonly files?: readonly string[];
    readonly fix?: boolean;
    readonly cwd?: string;
}): {
    command: string;
    args: readonly string[];
};
//# sourceMappingURL=lint.d.ts.map