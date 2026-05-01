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
import { resolveProjectRoot } from './_shared/project-root.js';
import { isMissingBinary, isRunFailure, runCommand } from './_shared/run-command.js';
const inputSchema = z.object({
    files: z.array(z.string()).optional(),
    fix: z.boolean().optional().default(false),
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
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { issues: [], parseError: `oxlint JSON.parse failed: ${reason}` };
    }
    if (!Array.isArray(parsed)) {
        return { issues: [], parseError: 'oxlint output was not a JSON array' };
    }
    const issues = [];
    for (const fileReport of parsed) {
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
const tool = {
    name: 'ak_lint',
    description: 'Run lint via `oxlint` (fast, structured JSON output) with `pnpm lint` as a fallback when oxlint is not on PATH. Returns `{passed, issues: [{file, line, rule, message}]}`.',
    inputSchema,
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
            const payload = {
                passed: oxlintOutcome.exitCode === 0,
                issues,
                backend: 'oxlint',
                exitCode: oxlintOutcome.exitCode,
                output: oxlintOutcome.stderr || undefined,
            };
            if (parseError)
                payload.parseError = parseError;
            if (oxlintOutcome.timedOut)
                payload.timedOut = true;
            if (oxlintOutcome.aborted)
                payload.aborted = true;
            return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
        }
        // Only fall back to pnpm lint when oxlint is genuinely missing on PATH.
        // Other spawn errors (EPERM, EAGAIN, ELOOP) are real failures and should
        // surface — silently routing them to pnpm masks setup bugs.
        if (!isMissingBinary(oxlintOutcome)) {
            const payload = {
                passed: false,
                issues: [],
                backend: 'oxlint',
                exitCode: 1,
                spawnError: `oxlint spawn failed: ${oxlintOutcome.error.code ?? 'unknown'} ${oxlintOutcome.error.message}`,
            };
            // `isError: true` per MCP spec — the tool didn't run, the agent can't
            // resolve this by changing inputs. Distinct from "lint found issues."
            return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true };
        }
        const pnpmOutcome = await runCommand('pnpm', ['lint'], runOptions);
        if (isRunFailure(pnpmOutcome)) {
            const payload = {
                passed: false,
                issues: [],
                backend: 'pnpm',
                exitCode: 1,
                spawnError: `oxlint missing and pnpm spawn failed: ${pnpmOutcome.error.message}`,
            };
            return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true };
        }
        const payload = {
            passed: pnpmOutcome.exitCode === 0,
            issues: [],
            backend: 'pnpm',
            exitCode: pnpmOutcome.exitCode,
            output: [pnpmOutcome.stdout, pnpmOutcome.stderr].filter(Boolean).join(''),
        };
        if (pnpmOutcome.timedOut)
            payload.timedOut = true;
        if (pnpmOutcome.aborted)
            payload.aborted = true;
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
};
export default tool;
//# sourceMappingURL=lint.js.map