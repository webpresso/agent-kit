import type { MergeOptions, MergeResult } from './merge.js';
export interface GitignoreBlock {
    id: string;
    patterns: readonly string[];
}
export type GeneratedIndexCleanupResult = {
    kind: 'skipped-dry-run';
    pathspecs: readonly string[];
} | {
    kind: 'skipped-not-git';
    pathspecs: readonly string[];
} | {
    kind: 'ok';
    pathspecs: readonly string[];
    removedPaths: readonly string[];
} | {
    kind: 'failed';
    pathspecs: readonly string[];
    exitCode: number | null;
    stderr: string;
};
/** Canonical gitignore block for webpresso generated/transient paths. */
export declare const GENERATED_PATHS_BLOCK: GitignoreBlock;
export declare function untrackGeneratedGitignoredPaths(repoRoot: string, block?: GitignoreBlock, opts?: Pick<MergeOptions, 'dryRun'>): GeneratedIndexCleanupResult;
export declare function patchGitignore(targetPath: string, block: GitignoreBlock, opts?: MergeOptions): MergeResult;
//# sourceMappingURL=gitignore-patcher.d.ts.map