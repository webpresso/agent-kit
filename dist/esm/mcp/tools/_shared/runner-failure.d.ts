/**
 * Shared runner-failure bounding for the check tools (`wp_typecheck`, `wp_lint`,
 * `wp_test`).
 *
 * A check that exits non-zero but yields ZERO parseable structured results is a
 * runner/launcher failure — e.g. a missing `vp`/`tsc`/test-runner binary
 * printing a Node `MODULE_NOT_FOUND` stack — not a genuine type/lint/test
 * failure. Left alone, that raw output falls through each tool's transform to
 * the generic passthrough (clipped only at 4000 chars), so it can become the
 * leaf's measured `bytes` and blow the compact QA evidence budget (≤800/leaf),
 * shipping an unbounded blob masquerading as tool output.
 *
 * `isRunnerFailure` detects the case from a count the caller already has (tsc
 * errors / oxlint issues / parsed test failures), so it never misclassifies a
 * real failure that produced structured results. `boundRunnerFailureEvidence`
 * clips the evidence well under the budget and persists the full output to a log
 * (truthful, not dropped). The caller keeps `passed: false` so the failure stays
 * loud.
 */
import type { TransformResult } from '#output-transforms/index';
export declare function stripTransform(result: TransformResult): Omit<TransformResult, 'transform'>;
export declare function isRunnerFailure(input: {
    passed: boolean;
    timedOut: boolean;
    aborted: boolean;
    parsedCount: number;
    output: string;
}): boolean;
export declare function boundRunnerFailureEvidence(output: string, toolName: string, cwd?: string): Omit<TransformResult, 'transform'>;
//# sourceMappingURL=runner-failure.d.ts.map