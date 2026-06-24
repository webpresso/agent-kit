import { z } from 'zod';
import { clipRawOutput } from './_shared/result.js';
import { resolveProjectRoot } from './_shared/project-root.js';
import { redactText } from './_shared/redact.js';
import { isMissingBinary, isRunFailure, runCommand, } from './_shared/run-command.js';
export const readonlyOpsBaseSchema = z
    .object({
    cwd: z.string().optional(),
    directory: z.string().optional(),
    maxOutputBytes: z.number().int().positive().max(64_000).optional().default(4_000),
    timeoutMs: z.number().int().positive().max(300_000).optional().default(120_000),
})
    .strict();
export function resolveReadonlyCwd(input) {
    return resolveProjectRoot(input.cwd ? { cwd: input.cwd } : input.directory ? { cwd: input.directory } : {});
}
export function parseJsonObject(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return undefined;
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return undefined;
    return parsed;
}
const MAX_DETAIL_STRING_CHARS = 1_000;
const MAX_DETAIL_ARRAY_ITEMS = 50;
const MAX_DETAIL_OBJECT_KEYS = 50;
function clipDetailString(value) {
    const redacted = redactText(value) ?? '';
    return redacted.length <= MAX_DETAIL_STRING_CHARS
        ? redacted
        : `${redacted.slice(0, MAX_DETAIL_STRING_CHARS)}…[truncated]`;
}
function sanitizeDetailValue(value) {
    if (typeof value === 'string')
        return clipDetailString(value);
    if (typeof value !== 'object' || value === null)
        return value;
    if (Array.isArray(value)) {
        const items = value.slice(0, MAX_DETAIL_ARRAY_ITEMS).map(sanitizeDetailValue);
        return value.length <= MAX_DETAIL_ARRAY_ITEMS
            ? items
            : [...items, { truncated: true, omittedItems: value.length - MAX_DETAIL_ARRAY_ITEMS }];
    }
    const entries = Object.entries(value);
    const limitedEntries = entries.slice(0, MAX_DETAIL_OBJECT_KEYS);
    const sanitized = Object.fromEntries(limitedEntries.map(([key, entryValue]) => [
        clipDetailString(key),
        sanitizeDetailValue(entryValue),
    ]));
    if (entries.length > MAX_DETAIL_OBJECT_KEYS) {
        sanitized.truncated = true;
        sanitized.omittedKeys = entries.length - MAX_DETAIL_OBJECT_KEYS;
    }
    return sanitized;
}
function sanitizeParsedDetails(parsed, maxOutputBytes) {
    const sanitized = sanitizeDetailValue(parsed);
    const serialized = JSON.stringify(sanitized);
    if (Buffer.byteLength(serialized, 'utf8') <= maxOutputBytes)
        return sanitized;
    throw new Error(`parsed JSON details exceed maxOutputBytes (${maxOutputBytes})`);
}
export async function runReadonlyCommand(id, command, args, options) {
    const outcome = await runCommand(command, args, {
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
    });
    return normalizeCommandOutcome(id, { command, args }, outcome, options);
}
export function normalizeCommandOutcome(id, command, outcome, options) {
    if (isRunFailure(outcome)) {
        return {
            id,
            command,
            passed: false,
            missingBinary: isMissingBinary(outcome),
            warnings: [
                isMissingBinary(outcome)
                    ? `missing binary: ${command.command}`
                    : `failed to spawn ${command.command}: ${outcome.error.message}`,
            ],
        };
    }
    const combined = redactText([outcome.stdout, outcome.stderr].filter(Boolean).join('\n'));
    const clipped = clipRawOutput(combined, options.maxOutputBytes, {
        toolName: `wp_${id}`,
        persistOverflow: false,
    });
    const result = {
        id,
        command,
        passed: outcome.exitCode === 0,
        exitCode: outcome.exitCode,
        timedOut: outcome.timedOut || undefined,
        aborted: outcome.aborted || undefined,
        ...clipped,
    };
    if (options.parseJson && outcome.exitCode === 0) {
        try {
            const parsed = parseJsonObject(outcome.stdout);
            return parsed
                ? { ...result, details: sanitizeParsedDetails(parsed, options.maxOutputBytes) }
                : result;
        }
        catch (error) {
            return {
                ...result,
                passed: false,
                warnings: [
                    ...(result.warnings ?? []),
                    `could not parse JSON output from ${command.command}: ${error.message}`,
                ],
            };
        }
    }
    return result;
}
export function summarizeCommands(label, commands) {
    const failed = commands.filter((command) => !command.passed).length;
    if (failed === 0)
        return `${label} passed (${commands.length} check${commands.length === 1 ? '' : 's'})`;
    return `${label} failed (${failed}/${commands.length} check${commands.length === 1 ? '' : 's'} failed)`;
}
export function commandCounts(commands) {
    return {
        commandCount: commands.length,
        passedCount: commands.filter((command) => command.passed).length,
        failedCount: commands.filter((command) => !command.passed).length,
    };
}
//# sourceMappingURL=_readonly-ops.js.map