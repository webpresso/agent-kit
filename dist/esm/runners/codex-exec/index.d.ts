import type { SpawnSyncOptionsWithBufferEncoding, SpawnSyncReturns } from 'node:child_process';
import type { Runner, RunnerContext, RunnerExecution, RunnerTask } from '#runners/types';
type SpawnFn = (command: string, args: readonly string[], options: SpawnSyncOptionsWithBufferEncoding) => SpawnSyncReturns<Buffer>;
export interface CodexExecRunnerOptions {
    readonly spawn?: SpawnFn;
}
export declare class CodexExecRunner implements Runner {
    readonly id = "codex-exec";
    readonly version = "1.0.0";
    readonly capabilities: readonly string[];
    private readonly _spawn;
    constructor(options?: CodexExecRunnerOptions);
    prepare(task: RunnerTask, ctx: RunnerContext): RunnerExecution;
}
export {};
//# sourceMappingURL=index.d.ts.map