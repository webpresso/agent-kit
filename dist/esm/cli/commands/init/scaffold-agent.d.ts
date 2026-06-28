import { type MergeOptions, type MergeResult } from "./merge.js";
export declare const SHARED_FAVORITE_SKILLS: readonly ["fix", "verify", "testing-philosophy", "plan-refine", "pll", "best-practice-research", "claude", "review", "autoplan", "investigate", "health", "plan-eng-review", "plan-ceo-review", "plan-design-review", "plan-devex-review", "browse", "qa-only", "qa", "devex-review", "design-review"];
export declare const TIER1_SKILLS: readonly ["fix", "verify", "testing-philosophy", "plan-refine", "pll", "best-practice-research", "claude", "review", "autoplan", "investigate", "health", "plan-eng-review", "plan-ceo-review", "plan-design-review", "plan-devex-review", "browse", "qa-only", "qa", "devex-review", "design-review"];
export declare const OPTIONAL_SHARED_SKILLS: readonly ["systematic-debugging", "test-driven-development", "deep-research"];
export declare const TIER2_SKILLS: readonly ["systematic-debugging", "test-driven-development", "deep-research"];
/** Rendered separately into agent-skills/, but projected only on explicit opt-in. */
export declare const RENDERED_SKILLS: readonly ["monorepo-navigation"];
export declare function isProjectedManagedSkillSlug(skillSlug: string): boolean;
export declare function resolveManagedSkillSourceRoots(packageRoot: string): readonly string[];
export declare function findManagedSkillSource(packageRoot: string, skillSlug: string): string | null;
export declare function findMissingManagedSkillSources(packageRootOrCatalogDir: string, skillSlugs: readonly string[]): string[];
export declare function assertManagedSkillSourcesPresent(packageRootOrCatalogDir: string, skillSlugs: readonly string[]): void;
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