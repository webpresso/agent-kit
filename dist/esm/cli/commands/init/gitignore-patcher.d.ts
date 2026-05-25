import type { MergeOptions, MergeResult } from './merge.js';
export interface GitignoreBlock {
    id: string;
    patterns: readonly string[];
}
/** Canonical gitignore block for webpresso generated/transient paths. */
export declare const GENERATED_PATHS_BLOCK: GitignoreBlock;
export declare function patchGitignore(targetPath: string, block: GitignoreBlock, opts?: MergeOptions): MergeResult;
//# sourceMappingURL=gitignore-patcher.d.ts.map