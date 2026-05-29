import type { ResolvedTestTarget } from './target-resolver.js';
export interface CommandConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}
export type VpRunLogMode = 'interleaved' | 'labeled' | 'grouped';
export interface TestCommandOptions {
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
}
export declare function buildTestCommand(target: ResolvedTestTarget, options?: TestCommandOptions): CommandConfig;
export declare function buildVpTestCommand(filters: readonly string[], options?: TestCommandOptions): CommandConfig;
export declare function buildVitestCommand(files: readonly string[], options?: TestCommandOptions): CommandConfig;
export declare function getVpTestTask(options: Pick<TestCommandOptions, 'mutation' | 'workers' | 'watch'>): string;
//# sourceMappingURL=command-builder.d.ts.map