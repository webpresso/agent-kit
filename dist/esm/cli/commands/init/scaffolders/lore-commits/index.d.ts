import { type MergeOptions, type MergeResult } from '#cli/commands/init/merge';
export interface ScaffoldLoreCommitsInput {
    repoRoot: string;
    options: MergeOptions;
}
/**
 * Write the `.husky/commit-msg` hook for Lore trailer enforcement.
 *
 * Returns the merge result for the hook file.
 */
export declare function scaffoldLoreCommits(input: ScaffoldLoreCommitsInput): MergeResult;
//# sourceMappingURL=index.d.ts.map