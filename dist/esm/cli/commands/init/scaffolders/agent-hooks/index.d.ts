import { type MergeOptions, type MergeResult } from '#cli/commands/init/merge';
export interface ScaffoldAgentHooksInput {
    repoRoot: string;
    options: MergeOptions;
}
export interface ScaffoldAgentHooksResult {
    claude: MergeResult;
    codex: MergeResult;
}
export declare function scaffoldAgentHooks(input: ScaffoldAgentHooksInput): ScaffoldAgentHooksResult;
//# sourceMappingURL=index.d.ts.map