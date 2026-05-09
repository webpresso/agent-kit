import { spawnSync } from 'node:child_process';
import type { MergeOptions } from '#cli/commands/init/merge';
export interface EnsureRtkInput {
    repoRoot: string;
    options: MergeOptions;
    spawn?: typeof spawnSync;
}
export type EnsureRtkResult = {
    kind: 'rtk-ok';
    installed: boolean;
} | {
    kind: 'rtk-skipped-dry-run';
} | {
    kind: 'rtk-not-found';
    hint: string;
} | {
    kind: 'rtk-init-failed';
    exitCode: number;
};
export declare function ensureRtk(input: EnsureRtkInput): EnsureRtkResult;
//# sourceMappingURL=index.d.ts.map