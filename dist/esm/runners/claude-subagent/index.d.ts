import type { Runner, RunnerContext, RunnerExecution, RunnerTask } from '#runners/types';
import type { SubagentFn } from './types.js';
export declare class ClaudeSubagentRunner implements Runner {
    readonly id = "claude-subagent";
    readonly version: string;
    readonly capabilities: readonly string[];
    private readonly subagentFn;
    constructor(version: string, subagentFn?: SubagentFn);
    prepare(task: RunnerTask, ctx: RunnerContext): RunnerExecution;
}
//# sourceMappingURL=index.d.ts.map