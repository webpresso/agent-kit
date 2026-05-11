import { type MergeOptions, type MergeResult } from '#cli/commands/init/merge';
import type { VisionAnswers } from './interview.js';
export interface ScaffoldVisionInput {
    catalogDir: string;
    repoRoot: string;
    options: MergeOptions;
    answers?: VisionAnswers | null;
}
export declare function scaffoldVision(input: ScaffoldVisionInput): MergeResult;
//# sourceMappingURL=index.d.ts.map