/**
 * `wp_typecheck` MCP tool.
 *
 * Runs the normal scope typecheck at cwd, or resolves exact package targets /
 * source-file targets to their owning scope(s) and runs each scope once.
 * `files` never means isolated-file `tsc`; it is a scope selector only.
 */
import { z } from 'zod';
import { formatMcpToolOutput } from './_shared/full-output.js';
import { resolveProjectRoot } from './_shared/project-root.js';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
import { boundRunnerFailureEvidence, isRunnerFailure } from './_shared/runner-failure.js';
import { runTypecheck } from '#typecheck/index.js';
const inputSchema = z.object({
    cwd: z.string().optional(),
    packages: z
        .array(z.string())
        .optional()
        .describe('Exact package.json names. No fuzzy or path matching.'),
    files: z
        .array(z.string())
        .optional()
        .describe('Source files whose owning scope should be typechecked; never isolated-file tsc.'),
    full: z.boolean().optional().default(false),
});
const tscErrorSchema = z.object({
    file: z.string(),
    line: z.number(),
    code: z.string(),
    message: z.string(),
});
const outputSchema = createSummaryOutputSchema({
    counts: z.object({
        errorCount: z.number(),
    }),
    details: z.object({
        errors: z.array(tscErrorSchema),
    }),
});
// Hard cap: a hung tsc invocation must surface as a timeout, never as a stall.
const TYPECHECK_COMMAND_TIMEOUT_MS = 10 * 60 * 1_000;
function summarizeTypecheckResult(options) {
    if (options.timedOut)
        return 'typecheck timed out';
    if (options.aborted)
        return 'typecheck aborted';
    if (options.failedWithoutDiagnostics)
        return 'typecheck failed to run (no diagnostics parsed)';
    if (options.passed)
        return 'typecheck passed';
    return `typecheck failed with ${options.errorCount} error${options.errorCount === 1 ? '' : 's'}`;
}
const tool = {
    name: 'wp_typecheck',
    description: 'Run `tsc --noEmit` per resolved package (or at cwd) and return structured diagnostics parsed from tsc stdout.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Typecheck',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {});
        const result = await runTypecheck({
            cwd,
            packages: input.packages,
            files: input.files,
            timeoutMs: TYPECHECK_COMMAND_TIMEOUT_MS,
            signal: extra?.signal,
        });
        const combinedOutput = result.output;
        const failedWithoutDiagnostics = isRunnerFailure({
            passed: result.passed,
            timedOut: result.timedOut === true,
            aborted: result.aborted === true,
            parsedCount: result.errors.length,
            output: combinedOutput,
        });
        const compact = input.full
            ? formatMcpToolOutput(combinedOutput, { toolName: 'wp_typecheck', full: true, cwd })
            : failedWithoutDiagnostics
                ? boundRunnerFailureEvidence(combinedOutput, 'wp_typecheck', cwd)
                : formatMcpToolOutput(combinedOutput, { toolName: 'wp_typecheck', cwd });
        const payload = {
            passed: result.passed,
            summary: summarizeTypecheckResult({
                passed: result.passed,
                errorCount: result.errors.length,
                timedOut: result.timedOut === true,
                aborted: result.aborted === true,
                failedWithoutDiagnostics,
            }),
            counts: { errorCount: result.errors.length },
            details: { errors: result.errors },
            ...compact,
            timedOut: result.timedOut || undefined,
            aborted: result.aborted || undefined,
        };
        return createSummaryResult(payload);
    },
};
export default tool;
//# sourceMappingURL=typecheck.js.map