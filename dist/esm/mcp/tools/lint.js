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
import { spawn } from 'node:child_process';
import { z } from 'zod';
const inputSchema = z.object({
    files: z.array(z.string()).optional(),
    fix: z.boolean().optional().default(false),
});
function isSpawnFailure(outcome) {
    return outcome.error !== undefined;
}
function runCommand(cmd, args) {
    return new Promise((resolve) => {
        const child = spawn(cmd, [...args]);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });
        child.on('error', (err) => {
            resolve({ error: err });
        });
        child.on('close', (code) => {
            resolve({ stdout, stderr, exitCode: code ?? 0 });
        });
    });
}
/**
 * Parse oxlint's `--format=json` output into our flattened issue list.
 *
 * oxlint emits an ESLint-compatible array: `[{filePath, messages: [...]}, ...]`.
 * If parsing fails (bad JSON, unexpected shape) we return an empty list rather
 * than throwing — the surrounding `passed` flag still reflects the exit code so
 * callers learn the lint failed even when the structured output is opaque.
 */
function parseOxlintIssues(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        return [];
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        return [];
    }
    if (!Array.isArray(parsed))
        return [];
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
    return issues;
}
const tool = {
    name: 'ak_lint',
    description: 'Run lint via `oxlint` (fast, structured JSON output) with `pnpm lint` as a fallback when oxlint is not on PATH. Returns `{passed, issues: [{file, line, rule, message}]}`.',
    inputSchema,
    handler: async (raw) => {
        const input = inputSchema.parse(raw ?? {});
        const oxlintArgs = ['--format=json'];
        if (input.fix)
            oxlintArgs.push('--fix');
        if (input.files && input.files.length > 0) {
            oxlintArgs.push(...input.files);
        }
        else {
            oxlintArgs.push('.');
        }
        const oxlintOutcome = await runCommand('oxlint', oxlintArgs);
        if (!isSpawnFailure(oxlintOutcome)) {
            const issues = parseOxlintIssues(oxlintOutcome.stdout);
            const payload = {
                passed: oxlintOutcome.exitCode === 0,
                issues,
                backend: 'oxlint',
                exitCode: oxlintOutcome.exitCode,
            };
            return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
        }
        // ENOENT (or any spawn-time failure) → fall back to pnpm lint.
        const pnpmOutcome = await runCommand('pnpm', ['lint']);
        if (isSpawnFailure(pnpmOutcome)) {
            const payload = {
                passed: false,
                issues: [],
                backend: 'pnpm',
                exitCode: 1,
                output: `oxlint missing and pnpm spawn failed: ${pnpmOutcome.error.message}`,
            };
            return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
        }
        const payload = {
            passed: pnpmOutcome.exitCode === 0,
            issues: [],
            backend: 'pnpm',
            exitCode: pnpmOutcome.exitCode,
            output: [pnpmOutcome.stdout, pnpmOutcome.stderr].filter(Boolean).join(''),
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
};
export default tool;
//# sourceMappingURL=lint.js.map