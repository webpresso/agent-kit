import { z } from 'zod';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
import { readonlyOpsBaseSchema, resolveReadonlyCwd, runReadonlyCommand } from './_readonly-ops.js';
const inputSchema = readonlyOpsBaseSchema
    .extend({
    source: z.enum(['session-memory', 'rtk']).optional().default('session-memory'),
    format: z.enum(['summary', 'json']).optional().default('summary'),
})
    .strict();
const outputSchema = createSummaryOutputSchema({
    details: z.object({
        cwd: z.string(),
        source: z.enum(['session-memory', 'rtk']),
        format: z.enum(['summary', 'json']),
        command: z.record(z.string(), z.unknown()),
        result: z.record(z.string(), z.unknown()),
    }),
});
function commandFor(input) {
    if (input.source === 'rtk')
        return { command: 'rtk', args: ['gain', '--format', 'json'] };
    return { command: './bin/wp', args: ['gain'] };
}
const tool = {
    name: 'wp_gain',
    description: 'Read existing Webpresso session-memory or RTK gain totals with bounded output; does not create gain data.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'WP gain',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const cwd = resolveReadonlyCwd(input);
        const command = commandFor(input);
        const result = await runReadonlyCommand('gain', command.command, command.args, {
            cwd,
            timeoutMs: input.timeoutMs,
            maxOutputBytes: input.maxOutputBytes,
            signal: extra?.signal,
            parseJson: input.source === 'rtk' || input.format === 'json',
        });
        return createSummaryResult({
            passed: result.passed,
            summary: result.passed
                ? `${input.source} gain read successfully`
                : `${input.source} gain unavailable`,
            exitCode: result.exitCode,
            counts: {
                commandCount: 1,
                passedCount: result.passed ? 1 : 0,
                failedCount: result.passed ? 0 : 1,
            },
            details: {
                cwd,
                source: input.source,
                format: input.format,
                command: result.command,
                result,
            },
            rawOutput: result.rawOutput,
            truncated: result.truncated,
            timedOut: result.timedOut,
            aborted: result.aborted,
            warnings: result.warnings,
        });
    },
};
export default tool;
//# sourceMappingURL=gain.js.map