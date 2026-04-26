/**
 * `omx` scaffolder preset.
 *
 * Chains `omx setup --yes` after the agent-kit scaffold completes. OMX
 * (oh-my-codex) is the operator-workflow execution layer; it manages
 * its own scaffolding idempotently — we just verify it's on PATH and spawn it.
 *
 * Required when downstream features rely on `omx team` (see
 * `cli/commands/blueprint/execution.ts`).
 */
import { spawnSync } from 'node:child_process';
import type { MergeOptions } from '../../merge.js';
export interface ScaffoldOmxInput {
    repoRoot: string;
    options: MergeOptions;
    /** Dependency-injection seam for tests; defaults to node's child_process.spawnSync. */
    spawn?: typeof spawnSync;
}
export type ScaffoldOmxResult = {
    kind: 'omx-ok';
} | {
    kind: 'omx-skipped-dry-run';
} | {
    kind: 'omx-not-found';
    hint: string;
} | {
    kind: 'omx-spawn-failed';
    exitCode: number;
};
/**
 * Probe for `omx` on PATH then run `omx setup --yes` in the consumer repo.
 */
export declare function scaffoldOmx(input: ScaffoldOmxInput): ScaffoldOmxResult;
//# sourceMappingURL=index.d.ts.map