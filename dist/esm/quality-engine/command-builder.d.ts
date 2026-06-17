/**
 * Command Builder
 *
 * Pure functions for building lint, typecheck, test, and qa command configurations.
 * These functions return command objects that can be executed by CLI tools.
 *
 * @module
 */
import type { ResolvedTarget } from './target-resolver.js';
/**
 * Command configuration object.
 * Can be executed by CLI tools using system-commands or similar.
 */
export interface CommandConfig {
    /** Command to execute (e.g., 'pnpm', 'oxlint', 'vitest') */
    command: string;
    /** Command arguments */
    args: string[];
    /** Environment variables */
    env?: Record<string, string>;
}
export type VpRunLogMode = 'interleaved' | 'labeled' | 'grouped';
/**
 * Convert a CommandConfig to a shell-executable string.
 */
export declare function commandConfigToString(config: CommandConfig): string;
export interface LintOptions {
    fix?: boolean;
    fixUnsafe?: boolean;
}
/**
 * Build oxlint command configuration.
 */
export declare function buildLintCommand(resolved: ResolvedTarget, options?: LintOptions): CommandConfig;
/**
 * Build oxfmt command configuration.
 */
export declare function buildFormatCommand(resolved: ResolvedTarget): CommandConfig;
export interface TypecheckOptions {
    noCache?: boolean;
    continue?: boolean;
    cache?: boolean;
    concurrencyLimit?: number;
    log?: VpRunLogMode;
    parallel?: boolean;
}
/**
 * Build typecheck command configuration.
 */
export declare function buildTypecheckCommand(resolved: ResolvedTarget, repoRoot: string, options?: TypecheckOptions): CommandConfig;
/**
 * Convert file paths to package filters for typecheck.
 */
export declare function filePathsToPackageFilters(filePaths: string[], repoRoot: string, resolveTargetStrict: (target: string, deps: {
    repoRoot: string;
}) => ResolvedTarget): string[];
export interface TestOptions {
    watch?: boolean;
    coverage?: boolean;
    testNamePattern?: string;
    noCache?: boolean;
    continue?: boolean;
    mutation?: boolean;
    workers?: boolean;
    json?: boolean;
    all?: boolean;
    affected?: boolean;
    passthrough?: string[];
    cache?: boolean;
    concurrencyLimit?: number;
    log?: VpRunLogMode;
    parallel?: boolean;
}
/**
 * Get the Vite+ run task name based on test options.
 */
export declare function getVpTestTask(options: TestOptions): string;
/**
 * Build Vite+ test command configuration for workspace/package targets.
 */
export declare function buildVpTestCommand(filters: string[], options?: TestOptions, useJsonReporter?: boolean): CommandConfig;
/**
 * Build vitest command configuration for file targets.
 */
export declare function buildVitestCommand(files: string[], options: TestOptions, projectRoot?: string): CommandConfig;
export type CheckType = 'lint' | 'typecheck' | 'test';
export interface QaOptions {
    quick?: boolean;
    continue?: boolean;
    noCache?: boolean;
    cache?: boolean;
    concurrencyLimit?: number;
    log?: VpRunLogMode;
}
/**
 * Core package checks (always run).
 */
export declare const CORE_CHECKS: readonly CheckType[];
/**
 * Quick checks (subset for --quick mode).
 */
export declare const QUICK_CHECKS: readonly CheckType[];
/**
 * Get the list of check types based on options.
 */
export declare function getCheckTypes(options: QaOptions): readonly CheckType[];
/**
 * Build a combined Vite+ command for package QA.
 */
export declare function buildCombinedVpCommand(checkTypes: readonly CheckType[], filters: string[], options: QaOptions): CommandConfig;
/**
 * Options as received from CAC (string | string[] for variadic flags).
 */
export interface CacRawOptions {
    package?: string | string[];
    file?: string | string[];
    noCache?: boolean;
    cache?: boolean;
}
/**
 * Normalized options with arrays and boolean flags resolved.
 */
export interface NormalizedCommandInputs {
    targets: string[];
    options: {
        package?: string[];
        file?: string[];
        noCache?: boolean;
    };
}
/**
 * Normalize CAC's raw inputs into consistent arrays.
 *
 * Handles:
 * - `--no-cache` → `noCache: true`
 * - `--package <names...>` as string or string[]
 * - `--file <paths...>` as string or string[]
 * - Positional targets merged into --file or --package when both present
 */
export declare function normalizeCacInputs(targets: string[] | string | undefined, rawOptions: CacRawOptions): NormalizedCommandInputs;
//# sourceMappingURL=command-builder.d.ts.map