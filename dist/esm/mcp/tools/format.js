/**
 * `wp_format` MCP tool.
 *
 * Runs `oxfmt` on the resolved project root. By default writes fixes in
 * place; pass `check: true` to verify formatting without writing (useful
 * for CI / pre-commit). Returns the standard summary-first payload:
 *
 *   {
 *     passed: boolean,
 *     summary: string,
 *     exitCode: number,
 *     details: { spawnError?: string },
 *   }
 *
 * No fallback — `oxfmt` must be on PATH. When missing, the tool returns
 * `isError: true` with a clear install hint.
 */
import { z } from 'zod';
import { applyOutputTransform } from '#output-transforms/index';
import { resolveProjectRoot } from './_shared/project-root.js';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
import { isMissingBinary, isRunFailure, runCommand } from './_shared/run-command.js';
const inputSchema = z.object({
    check: z.boolean().optional().default(false),
    cwd: z.string().optional(),
});
const outputSchema = createSummaryOutputSchema({
    details: z.object({
        spawnError: z.string().optional(),
    }),
});
const FORMAT_COMMAND_TIMEOUT_MS = 5 * 60 * 1_000;
const tool = {
    name: 'wp_format',
    description: 'Run formatter via `oxfmt`. By default writes fixes in place; pass `check: true` to verify without writing. No fallback — oxfmt must be on PATH.',
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
        const cwd = resolveProjectRoot(input.cwd ? { explicitCwd: input.cwd } : {});
        const runOptions = {
            timeoutMs: FORMAT_COMMAND_TIMEOUT_MS,
            signal: extra?.signal,
            cwd,
        };
        const args = input.check ? ['--check'] : ['--write'];
        // Force --ignore-path to .gitignore so a `*` .prettierignore (used to
        // disable conflicting IDE Prettier extensions) doesn't make oxfmt skip
        // every file. .oxfmtrc.json#ignorePatterns still applies on top.
        args.push('--ignore-path', '.gitignore');
        const outcome = await runCommand('oxfmt', args, runOptions);
        if (isRunFailure(outcome)) {
            const message = isMissingBinary(outcome)
                ? 'oxfmt binary not found on PATH. Install with: vp install -D oxfmt'
                : `oxfmt spawn failed: ${outcome.error.code ?? 'unknown'} ${outcome.error.message}`;
            const payload = {
                passed: false,
                summary: isMissingBinary(outcome)
                    ? 'format could not start: oxfmt binary missing on PATH'
                    : 'format could not start: oxfmt spawn failed',
                exitCode: 1,
                details: { spawnError: message },
            };
            return createSummaryResult(payload, { isError: true });
        }
        const combined = [outcome.stdout, outcome.stderr].filter(Boolean).join('');
        const { transform: _transform, ...compact } = applyOutputTransform(combined, {
            toolName: 'wp_format',
        });
        const payload = {
            passed: outcome.exitCode === 0,
            summary: summarizeFormatResult({
                passed: outcome.exitCode === 0,
                check: input.check,
                exitCode: outcome.exitCode,
                timedOut: outcome.timedOut,
                aborted: outcome.aborted,
            }),
            exitCode: outcome.exitCode,
            details: {},
            ...compact,
            timedOut: outcome.timedOut || undefined,
            aborted: outcome.aborted || undefined,
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