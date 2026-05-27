import { type MergeOptions, type MergeResult } from './merge.js';
export interface ScaffoldBaseKitInput {
    catalogDir: string;
    repoRoot: string;
    options: MergeOptions;
    globalInstall?: boolean;
}
export declare function scaffoldBaseKit(input: ScaffoldBaseKitInput): MergeResult[];
//# sourceMappingURL=scaffold-base-kit.d.ts.map