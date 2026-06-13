import type { SpawnSyncReturns } from 'node:child_process';
import type { Runner, RunnerContext, RunnerExecution, RunnerTask } from '#runners/types';
type SpawnSyncFn = (command: string, args: readonly string[], options?: {
    cwd?: string;
}) => SpawnSyncReturns<Buffer>;
interface LocalWorktreeRunnerOptions {
    /** Injected for testing; defaults to Node's spawnSync. */
    readonly spawnSync?: SpawnSyncFn;
}
export declare class LocalWorktreeRunner implements Runner {
    readonly id = "local-worktree";
    readonly version = "0.1.0";
    readonly capabilities: readonly string[];
    private readonly spawnSync;
    constructor(opts?: LocalWorktreeRunnerOptions);
    prepare(task: RunnerTask, ctx: RunnerContext): RunnerExecution;
}
export {};
//# sourceMappingURL=index.d.ts.map