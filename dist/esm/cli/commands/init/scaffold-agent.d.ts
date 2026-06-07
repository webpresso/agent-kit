import { type MergeOptions, type MergeResult } from './merge.js';
export declare const TIER1_SKILLS: readonly ["fix", "verify", "testing-philosophy", "plan-refine", "pll"];
export declare const TIER2_SKILLS: readonly ["systematic-debugging", "test-driven-development", "deep-research"];
/** Always-installed skill (rendered separately). Excluded from the generic copy. */
export declare const RENDERED_SKILLS: readonly ["monorepo-navigation"];
export interface ScaffoldAgentInput {
    catalogDir: string;
    repoRoot: string;
    options: MergeOptions;
}
export interface ScaffoldAgentReport {
    results: MergeResult[];
}
export declare function scaffoldAgent(input: ScaffoldAgentInput): ScaffoldAgentReport;
//# sourceMappingURL=scaffold-agent.d.ts.map