import { type MergeResult } from './merge.js';
export interface ScaffoldAgentRulesOptions {
    cwd: string;
    dryRun?: boolean;
    overwrite?: boolean;
}
export interface ScaffoldAgentRulesResult {
    results: readonly MergeResult[];
}
export declare function scaffoldAgentRules(opts: ScaffoldAgentRulesOptions): ScaffoldAgentRulesResult;
//# sourceMappingURL=scaffold-agent-rules.d.ts.map