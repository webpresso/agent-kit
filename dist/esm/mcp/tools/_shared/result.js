import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { RAW_BYTES_BASIS_VALUES, GAIN_PRECISION } from '#session-memory/gain-types.js';
import { sessionElisionSchema } from '#mcp/_session-elision-schema.js';
const DEFAULT_RAW_OUTPUT_LIMIT = 4_000;
const DEFAULT_SUMMARY_TEXT_LIMIT = 240;
export const failureSchema = z.object({
    file: z.string().optional(),
    line: z.number().optional(),
    code: z.string().optional(),
    message: z.string(),
});
export const transformMetadataSchema = z.object({
    toolName: z.string(),
    normalizedToolName: z.string(),
    tier: z.enum(['passthrough', 'registered']),
    rawBytes: z.number(),
});
export const gainTelemetrySchema = z.object({
    rawBasisBytes: z.number(),
    returnedToolResultBytes: z.number(),
    gainBytes: z.number(),
    approxTokensSaved: z.number(),
    precision: z.literal(GAIN_PRECISION),
    rawBytesBasis: z.enum(RAW_BYTES_BASIS_VALUES),
});
export const elisionSchema = sessionElisionSchema;
export const summaryFirstResultSchema = z.object({
    passed: z.boolean(),
    summary: z.string(),
    exitCode: z.number().optional(),
    counts: z.record(z.string(), z.number()).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    rawOutput: z.string().optional(),
    truncated: z.boolean().optional(),
    timedOut: z.boolean().optional(),
    aborted: z.boolean().optional(),
    logPath: z.string().optional(),
    failures: z.array(failureSchema).optional(),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    bytes: z.number().optional(),
    tokensSaved: z.number().optional(),
    gain: gainTelemetrySchema.optional(),
    elisions: z.array(elisionSchema).optional(),
    warnings: z.array(z.string()).optional(),
    transform: transformMetadataSchema.optional(),
});
export function createSummaryOutputSchema(options = {}) {
    const shape = {};
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
    const clipped = rawOutput.slice(0, maxChars);
    const logPath = options.persistOverflow !== false && options.toolName
        ? persistToolLog(options.toolName, rawOutput)
        : undefined;
    const recorded = options.elisionRecorder?.record({
        source: options.toolName ?? 'tool-output',
        kind: 'truncated_output',
        text: rawOutput,
        returnedText: clipped,
        metadata: {
            toolName: options.toolName,
            reason: 'raw_output_limit',
        },
    });
    return {
        rawOutput: clipped,
        truncated: true,
        ...(logPath ? { logPath } : {}),
        ...(recorded?.elision ? { elisions: [recorded.elision] } : {}),
        ...(recorded?.warning ? { warnings: [recorded.warning] } : {}),
    };
}
export function createSummaryResult(payload, options = {}) {
    const text = clipSummaryText(options.text ?? payload.summary);
    return {
        content: [{ type: 'text', text }],
        structuredContent: payload,
        ...(options.isError ? { isError: true } : {}),
    };
}
function clipSummaryText(text) {
    const normalized = text.trim();
    if (normalized.length <= DEFAULT_SUMMARY_TEXT_LIMIT)
        return normalized;
    return `${normalized.slice(0, DEFAULT_SUMMARY_TEXT_LIMIT - 1).trimEnd()}…`;
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