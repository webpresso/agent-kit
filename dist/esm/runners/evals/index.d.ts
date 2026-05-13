import type { RunnerEvent } from '#runners/types';
import type { SubagentFn } from '#runners/claude-subagent/types';
export interface Eval {
    readonly name: string;
    readonly blueprintPath: string;
    run(): Promise<EvalResult>;
}
export interface EvalResult {
    readonly name: string;
    readonly passed: boolean;
    readonly skipped: boolean;
    readonly events: readonly RunnerEvent[];
    readonly error?: string;
}
export declare function runAllEvals(subagentFn?: SubagentFn): Promise<EvalResult[]>;
//# sourceMappingURL=index.d.ts.map