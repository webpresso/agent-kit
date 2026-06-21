import { z } from 'zod';
import { buildSecretGateCommand, runSecretGateCommand } from '#secret-gate/runner.js';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
import { redactText } from './_shared/redact.js';
const inputSchema = z
    .object({
    cwd: z.string().optional(),
    worker: z.string(),
    environment: z.string().optional(),
    config: z.string().optional(),
    status: z.enum(['ok', 'error', 'canceled']).optional().default('error'),
    format: z.enum(['json', 'pretty']).optional().default('json'),
    search: z.string().optional(),
    method: z.string().optional(),
    header: z.array(z.string()).optional().default([]),
    ip: z.array(z.string()).optional().default([]),
    samplingRate: z.number().optional(),
    versionId: z.string().optional(),
    timeoutMs: z.number().int().positive().max(120_000).optional().default(30_000),
    maxEvents: z.number().int().positive().max(200).optional().default(20),
    execute: z.boolean().optional().default(false),
})
    .strict();
const MAX_OUTPUT_BYTES = 64 * 1024;
const outputSchema = createSummaryOutputSchema({
    counts: z.object({
        eventCount: z.number(),
    }),
    details: z.object({
        command: z.object({ command: z.string(), args: z.array(z.string()) }),
    }),
});
function secretProfileForWorkerTail(input) {
    const environment = input.environment?.trim().toLowerCase();
    return environment === 'production' || environment === 'prd' ? 'production' : 'preview';
}
function buildWranglerTailArgs(input) {
    const args = ['tail', input.worker, '--format', input.format, '--status', input.status];
    if (input.environment)
        args.push('--env', input.environment);
    if (input.config)
        args.push('--config', input.config);
    if (input.search)
        args.push('--search', input.search);
    if (input.method)
        args.push('--method', input.method);
    if (input.samplingRate !== undefined)
        args.push('--sampling-rate', String(input.samplingRate));
    if (input.versionId)
        args.push('--version-id', input.versionId);
    for (const header of input.header)
        args.push('--header', header);
    for (const ip of input.ip)
        args.push('--ip', ip);
    return args;
}
function parseEvents(output, maxEvents) {
    const events = [];
    for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') {
                events.push(parsed);
            }
        }
        catch {
            // ignore non-JSON lines in structured events; raw output retains them
        }
        if (events.length >= maxEvents)
            break;
    }
    return events;
}
const tool = {
    name: 'wp_worker_tail',
    description: 'Run `wrangler tail` via the public secret-gate contract and return bounded, redacted tail output.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Worker tail',
        readOnlyHint: false,
        idempotentHint: false,
        destructiveHint: false,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const args = buildWranglerTailArgs(input);
        const command = buildSecretGateCommand({
            sink: 'deploy-wrangler',
            profile: secretProfileForWorkerTail(input),
            command: 'wrangler',
            args,
        });
        if (!input.execute) {
            return createSummaryResult({
                passed: true,
                summary: `worker-tail dry-run prepared for ${input.worker}`,
                counts: { eventCount: 0 },
                details: { command },
            });
        }
        const result = await runSecretGateCommand({
            cwd: input.cwd,
            sink: 'deploy-wrangler',
            profile: secretProfileForWorkerTail(input),
            command: 'wrangler',
            args,
            timeoutMs: input.timeoutMs,
            maxOutputBytes: MAX_OUTPUT_BYTES,
            signal: extra?.signal,
        });
        const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
        const redactedOutput = redactText(combined) ?? '';
        const events = parseEvents(redactedOutput, input.maxEvents);
        const passed = result.exitCode === 0 || (result.timedOut && events.length > 0);
        return createSummaryResult({
            passed,
            summary: passed
                ? `worker-tail captured ${events.length} event${events.length === 1 ? '' : 's'}`
                : `worker-tail failed with exit ${result.exitCode}`,
            exitCode: result.exitCode,
            counts: { eventCount: events.length },
            details: { command },
            events,
            rawOutput: redactedOutput,
        });
    },
};
export default tool;
//# sourceMappingURL=worker-tail.js.map