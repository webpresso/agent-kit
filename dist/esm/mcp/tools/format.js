/**
 * `wp_format` MCP tool.
 *
 * Runs the repo formatting surface on the resolved project root. By default
 * writes fixes in place; pass `check: true` to verify formatting without
 * writing (useful for CI / pre-commit). Returns the standard summary-first payload:
 *
 *   {
 *     passed: boolean,
 *     summary: string,
 *     exitCode: number,
 *     details: { spawnError?: string },
 *   }
 *
 * No fallback — the managed formatter backend must be on PATH. When missing,
 * the tool returns `isError: true` with a clear install hint.
 */
import { z } from 'zod';
import { runFormat } from '#format/index';
import { applyOutputTransform } from '#output-transforms/index';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
const inputSchema = z.object({
    check: z.boolean().optional().default(false),
    cwd: z.string().optional(),
    files: z.array(z.string()).optional(),
});
const outputSchema = createSummaryOutputSchema({
    details: z.object({
        spawnError: z.string().optional(),
    }),
});
const tool = {
    name: 'wp_format',
    description: 'Run formatter via the repo formatting surface. By default writes fixes in place; pass `check: true` to verify without writing.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Format',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        let formatResult;
        try {
            formatResult = await runFormat({
                check: input.check,
                cwd: input.cwd,
                files: input.files,
                signal: extra?.signal,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return createSummaryResult({
                passed: false,
                summary: /binary not found/u.test(message)
                    ? 'format could not start: formatter backend missing on PATH'
                    : 'format could not start',
                exitCode: 1,
                details: { spawnError: message },
            }, { isError: true });
        }
        const combined = formatResult.output;
        const { transform: _transform, ...compact } = applyOutputTransform(combined, {
            toolName: 'wp_format',
        });
        const payload = {
            passed: formatResult.passed,
            summary: summarizeFormatResult({
                passed: formatResult.passed,
                check: input.check,
                exitCode: formatResult.exitCode,
                timedOut: formatResult.timedOut,
                aborted: formatResult.aborted,
            }),
            exitCode: formatResult.exitCode,
            details: formatResult.spawnError ? { spawnError: formatResult.spawnError } : {},
            ...compact,
            timedOut: formatResult.timedOut || undefined,
            aborted: formatResult.aborted || undefined,
        };
        return createSummaryResult(payload);
    },
};
function summarizeFormatResult(options) {
    if (options.timedOut)
        return 'format timed out';
    if (options.aborted)
        return 'format aborted';
    if (options.passed)
        return options.check ? 'format check passed' : 'format applied';
    return options.check
        ? `format check failed (exit ${options.exitCode}) — run \`wp format\` to apply fixes`
        : `format failed (exit ${options.exitCode})`;
}
export default tool;
//# sourceMappingURL=format.js.map