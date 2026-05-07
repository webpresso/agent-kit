/**
 * `ak_lint` MCP tool.
 *
 * Runs `oxlint` (preferred — fast, structured JSON output) on the supplied
 * files (or `.` when none are given). When the `oxlint` binary is absent on
 * PATH, falls back to `pnpm lint`. Returns a structured payload:
 *
 *   {
 *     passed: boolean,
 *     issues: Array<{file, line, rule, message}>,
 *     backend: 'oxlint' | 'pnpm',
 *     exitCode: number,
 *     output?: string,   // only on the pnpm fallback
 *   }
 *
 * The pnpm fallback intentionally does NOT parse output — `pnpm lint` aggregates
 * heterogeneous per-package linters whose stdout shapes differ. Raw output is
 * passed through in `output` for human inspection.
 */
import { z } from 'zod';
import { applyOutputTransform } from '#output-transforms/index';
import { resolveProjectRoot } from './_shared/project-root.js';
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js';
import { isMissingBinary, isRunFailure, runCommand } from './_shared/run-command.js';
const inputSchema = z.object({
    files: z.array(z.string()).optional(),
    fix: z.boolean().optional().default(false),
});
const lintIssueSchema = z.object({
    file: z.string(),
    line: z.number(),
    rule: z.string(),
    message: z.string(),
});
const outputSchema = createSummaryOutputSchema({
    backend: z.enum(['oxlint', 'pnpm']),
    counts: z.object({
        issueCount: z.number(),
    }),
    details: z.object({
        issues: z.array(lintIssueSchema),
        parseError: z.string().optional(),
        spawnError: z.string().optional(),
    }),
});
// Hard cap so a hung lint cannot hang the MCP tool. Lints over 5 minutes are
// pathological; surface them as a timeout signal instead of a silent stall.
const LINT_COMMAND_TIMEOUT_MS = 5 * 60 * 1_000;
/**
 * Parse oxlint's `--format=json` output into our flattened issue list.
 *
 * oxlint emits an ESLint-compatible array: `[{filePath, messages: [...]}, ...]`.
 * On JSON parse failure or unexpected shape we annotate the outcome with a
 * concrete `parseError` instead of silently returning an empty list — the
 * caller can then distinguish "lint passed cleanly" from "we couldn't read
 * lint's output."
 */
function parseOxlintIssues(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        return { issues: [] };
    const jsonText = extractJsonObjectOrArray(trimmed) ?? trimmed;
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { issues: [], parseError: `oxlint JSON.parse failed: ${reason}` };
    }
    const reports = Array.isArray(parsed)
        ? parsed
        : normalizeWrappedOxlintReports(parsed);
    if (!Array.isArray(reports))
        return { issues: [], parseError: 'oxlint output was not a JSON array' };
    const issues = [];
    for (const fileReport of reports) {
        const file = fileReport?.filePath ?? '';
        const messages = fileReport?.messages;
        if (!Array.isArray(messages))
            continue;
        for (const m of messages) {
            issues.push({
                file,
                line: typeof m.line === 'number' ? m.line : 0,
                rule: m.ruleId ?? '',
                message: m.message ?? '',
            });
        }
    }
    return { issues };
}
function normalizeWrappedOxlintReports(parsed) {
    if (!parsed || typeof parsed !== 'object')
        return undefined;
    const wrapper = parsed;
    const reports = wrapper.diagnostics ?? wrapper.results;
    if (!Array.isArray(reports))
        return undefined;
    if (reports.every((report) => report && typeof report === 'object' && 'message' in report)) {
        return reports.map((report) => {
            const message = report;
            return {
                filePath: message.filename ?? '',
                messages: [
                    {
                        line: message.line ?? message.labels?.[0]?.span?.line ?? 0,
                        ruleId: message.ruleId ?? 'parse',
                        message: message.message ?? '',
                    },
                ],
            };
        });
    }
    return reports;
}
function extractJsonObjectOrArray(raw) {
    const start = raw.search(/[[{]/u);
    if (start < 0)
        return undefined;
    const open = raw[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
        const char = raw[index];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (char === '\\')
                escaped = true;
            else if (char === '"')
                inString = false;
            continue;
        }
        if (char === '"')
            inString = true;
        if (char === open)
            depth += 1;
        if (char === close)
            depth -= 1;
        if (depth === 0)
            return raw.slice(start, index + 1);
    }
    return undefined;
}
function summarizeLintResult(options) {
    if (options.timedOut)
        return `lint timed out via ${options.backend}`;
    if (options.aborted)
        return `lint aborted via ${options.backend}`;
    if (options.parseError)
        return `lint failed: could not parse ${options.backend} output`;
    if (options.passed)
        return `lint passed via ${options.backend}`;
    if (options.issueCount > 0) {
        return `lint failed with ${options.issueCount} issue${options.issueCount === 1 ? '' : 's'} via ${options.backend}`;
    }
    return `lint failed via ${options.backend} (exit ${options.exitCode})`;
}
const tool = {
    name: 'ak_lint',
    description: 'Run lint via `oxlint` (fast, structured JSON output) with `pnpm lint` as a fallback when oxlint is not on PATH. Returns `{passed, issues: [{file, line, rule, message}]}`.',
    inputSchema,
    outputSchema,
    annotations: {
        title: 'Lint',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
    handler: async (raw, extra) => {
        const input = inputSchema.parse(raw ?? {});
        const cwd = resolveProjectRoot();
        const runOptions = {
            timeoutMs: LINT_COMMAND_TIMEOUT_MS,
            signal: extra?.signal,
            cwd,
        };
        const oxlintArgs = ['--format=json'];
        if (input.fix)
            oxlintArgs.push('--fix');
        if (input.files && input.files.length > 0) {
            oxlintArgs.push(...input.files);
        }
        else {
            oxlintArgs.push('.');
        }
        const oxlintOutcome = await runCommand('oxlint', oxlintArgs, runOptions);
        if (!isRunFailure(oxlintOutcome)) {
            const { issues, parseError } = parseOxlintIssues(oxlintOutcome.stdout);
            const { transform: _transform, ...compact } = applyOutputTransform(oxlintOutcome.stdout || oxlintOutcome.stderr, {
                toolName: 'ak_lint-oxlint',
            });
            const payload = {
                passed: oxlintOutcome.exitCode === 0,
                summary: summarizeLintResult({
                    passed: oxlintOutcome.exitCode === 0,
                    backend: 'oxlint',
                    issueCount: issues.length,
                    exitCode: oxlintOutcome.exitCode,
                    parseError,
                    timedOut: oxlintOutcome.timedOut,
                    aborted: oxlintOutcome.aborted,
                }),
                backend: 'oxlint',
                exitCode: oxlintOutcome.exitCode,
                counts: { issueCount: issues.length },
                details: {
                    issues,
                    parseError,
                },
                ...compact,
                timedOut: oxlintOutcome.timedOut || undefined,
                aborted: oxlintOutcome.aborted || undefined,
            };
            return createSummaryResult(payload);
        }
        // Only fall back to pnpm lint when oxlint is genuinely missing on PATH.
        // Other spawn errors (EPERM, EAGAIN, ELOOP) are real failures and should
        // surface — silently routing them to pnpm masks setup bugs.
        if (!isMissingBinary(oxlintOutcome)) {
            const payload = {
                passed: false,
                summary: 'lint could not start: oxlint spawn failed',
                backend: 'oxlint',
                exitCode: 1,
                counts: { issueCount: 0 },
                details: {
                    issues: [],
                    spawnError: `oxlint spawn failed: ${oxlintOutcome.error.code ?? 'unknown'} ${oxlintOutcome.error.message}`,
                },
            };
            // `isError: true` per MCP spec — the tool didn't run, the agent can't
            // resolve this by changing inputs. Distinct from "lint found issues."
            return createSummaryResult(payload, { isError: true });
        }
        const pnpmOutcome = await runCommand('pnpm', ['lint'], runOptions);
        if (isRunFailure(pnpmOutcome)) {
            const payload = {
                passed: false,
                summary: 'lint could not start: pnpm lint spawn failed',
                backend: 'pnpm',
                exitCode: 1,
                counts: { issueCount: 0 },
                details: {
                    issues: [],
                    spawnError: `oxlint missing and pnpm spawn failed: ${pnpmOutcome.error.message}`,
                },
            };
            return createSummaryResult(payload, { isError: true });
        }
        const { transform: _transform, ...compact } = applyOutputTransform([pnpmOutcome.stdout, pnpmOutcome.stderr].filter(Boolean).join(''), {
            toolName: 'ak_lint-pnpm',
        });
        const payload = {
            passed: pnpmOutcome.exitCode === 0,
            summary: summarizeLintResult({
                passed: pnpmOutcome.exitCode === 0,
                backend: 'pnpm',
                issueCount: 0,
                exitCode: pnpmOutcome.exitCode,
                timedOut: pnpmOutcome.timedOut,
                aborted: pnpmOutcome.aborted,
            }),
            backend: 'pnpm',
            exitCode: pnpmOutcome.exitCode,
            counts: { issueCount: 0 },
            details: {
                issues: [],
            },
            ...compact,
            timedOut: pnpmOutcome.timedOut || undefined,
            aborted: pnpmOutcome.aborted || undefined,
        };
        return createSummaryResult(payload);
    },
};
export default tool;
//# sourceMappingURL=lint.js.map