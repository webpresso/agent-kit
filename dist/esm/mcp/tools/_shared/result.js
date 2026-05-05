import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
const DEFAULT_RAW_OUTPUT_LIMIT = 4_000;
export const summaryFirstResultSchema = z.object({
    passed: z.boolean(),
    summary: z.string(),
    exitCode: z.number().optional(),
    backend: z.string().optional(),
    counts: z.record(z.string(), z.number()).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    rawOutput: z.string().optional(),
    truncated: z.boolean().optional(),
    timedOut: z.boolean().optional(),
    aborted: z.boolean().optional(),
    logPath: z.string().optional(),
});
export function createSummaryOutputSchema(options = {}) {
    const shape = {};
    if (options.backend)
        shape.backend = options.backend;
    if (options.counts)
        shape.counts = options.counts.optional();
    if (options.details)
        shape.details = options.details.optional();
    return summaryFirstResultSchema.extend(shape);
}
export function clipRawOutput(rawOutput, maxChars = DEFAULT_RAW_OUTPUT_LIMIT, options = {}) {
    if (!rawOutput)
        return {};
    if (rawOutput.length <= maxChars) {
        return { rawOutput };
    }
    const logPath = options.persistOverflow !== false && options.toolName
        ? persistToolLog(options.toolName, rawOutput)
        : undefined;
    return {
        rawOutput: rawOutput.slice(0, maxChars),
        truncated: true,
        ...(logPath ? { logPath } : {}),
    };
}
export function createSummaryResult(payload, options = {}) {
    const text = JSON.stringify(payload);
    return {
        content: [{ type: 'text', text }],
        structuredContent: payload,
        ...(options.isError ? { isError: true } : {}),
    };
}
function persistToolLog(toolName, output) {
    const now = new Date();
    const dateDir = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
    const timeName = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const safeToolName = toolName.replace(/[^a-zA-Z0-9_-]/gu, '-');
    const relativePath = join('logs', dateDir, `${timeName}_${safeToolName}.log`);
    mkdirSync(join(process.cwd(), 'logs', dateDir), { recursive: true });
    writeFileSync(join(process.cwd(), relativePath), output, 'utf8');
    return relativePath;
}
function pad(value) {
    return String(value).padStart(2, '0');
}
//# sourceMappingURL=result.js.map