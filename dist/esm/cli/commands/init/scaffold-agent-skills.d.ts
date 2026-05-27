import { type MergeResult } from './merge.js';
export interface ScaffoldAgentSkillsOptions {
    cwd: string;
    dryRun?: boolean;
    overwrite?: boolean;
}
export interface ScaffoldAgentSkillsResult {
    results: readonly MergeResult[];
}
export declare function scaffoldAgentSkills(opts: ScaffoldAgentSkillsOptions): ScaffoldAgentSkillsResult;
//# sourceMappingURL=scaffold-agent-skills.d.ts.map