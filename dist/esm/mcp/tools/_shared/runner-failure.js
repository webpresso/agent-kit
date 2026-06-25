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
import { clipRawOutput } from "./result.js";
import { createSessionElisionRecorder } from "#mcp/_session-elision.js";
const RUNNER_FAILURE_EVIDENCE_BUDGET = 600;
export function stripTransform(result) {
    const { transform: _transform, ...rest } = result;
    return rest;
}
export function isRunnerFailure(input) {
    return (!input.passed &&
        !input.timedOut &&
        !input.aborted &&
        input.parsedCount === 0 &&
        input.output.trim().length > 0);
}
export function boundRunnerFailureEvidence(output, toolName, cwd) {
    const clipped = clipRawOutput(output, RUNNER_FAILURE_EVIDENCE_BUDGET, {
        toolName,
        elisionRecorder: createSessionElisionRecorder({ cwd, sourcePrefix: toolName }),
    });
    const rawBytes = Buffer.byteLength(output);
    const bytes = Buffer.byteLength(clipped.rawOutput ?? "");
    return {
        ...clipped,
        failures: [],
        tier: 3,
        bytes,
        tokensSaved: Math.max(0, rawBytes - bytes),
    };
}
//# sourceMappingURL=runner-failure.js.map