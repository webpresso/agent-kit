import type { MergeOptions, MergeResult } from './merge.js';
export interface GitignoreBlock {
    id: string;
    patterns: readonly string[];
}
export declare function patchGitignore(targetPath: string, block: GitignoreBlock, opts?: MergeOptions): MergeResult;
//# sourceMappingURL=gitignore-patcher.d.ts.map