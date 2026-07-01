import type { ResolvedTestTarget } from "./target-resolver.js";
import { type ManagedRunnerOutputPolicy } from "#tool-runtime";
import { type TestSuiteName } from "./suite.js";
export interface SingleCommandConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}
export interface CommandSequenceConfig {
    sequence: readonly SingleCommandConfig[];
}
export type CommandConfig = SingleCommandConfig | CommandSequenceConfig;
export type VpRunLogMode = "interleaved" | "labeled" | "grouped";
export interface TestCommandOptions {
    cwd?: string;
    suite?: TestSuiteName;
    watch?: boolean;
    coverage?: boolean;
    testNamePattern?: string;
    mutation?: boolean;
    workers?: boolean;
    cache?: boolean;
    noCache?: boolean;
    parallel?: boolean;
    concurrencyLimit?: number;
    log?: VpRunLogMode;
    passthrough?: readonly string[];
    filterOutput?: boolean;
    outputPolicy?: ManagedRunnerOutputPolicy;
}
export declare function buildTestCommand(target: ResolvedTestTarget, options?: TestCommandOptions): CommandConfig;
export declare function buildVpTestCommand(filters: readonly string[], options?: TestCommandOptions): SingleCommandConfig;
export declare function buildVitestCommand(files: readonly string[], options?: TestCommandOptions): SingleCommandConfig;
export declare function buildStrykerCommand(options?: TestCommandOptions): CommandConfig;
export declare function getVpTestTask(options: Pick<TestCommandOptions, "mutation" | "workers" | "watch">): string;
export declare function isCommandSequenceConfig(config: CommandConfig): config is CommandSequenceConfig;
//# sourceMappingURL=command-builder.d.ts.map