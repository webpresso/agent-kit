/**
 * Stable subpath export: `@webpresso/agent-kit/lint`.
 *
 * Exposes a framework-friendly `runLint` runner that wraps `oxlint`
 * (preferred — fast, structured JSON output) with a `pnpm lint` fallback
 * when `oxlint` is not on PATH. Mirrors the semantics of the
 * `ak_lint` MCP tool but returns a typed result object directly so
 * external scaffolders (e.g. webpresso-framework Wave 2) can consume it
 * without reaching through the MCP transport.
 */
import { isMissingBinary, isRunFailure, runCommand, } from '#mcp/tools/_shared/run-command';
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root';
const DEFAULT_LINT_TIMEOUT_MS = 5 * 60 * 1_000;
/**
 * Parse oxlint's `--format=json` output (ESLint-compatible array shape) into
 * a flat issue list. Annotates `parseError` on JSON or shape failure so the
 * caller can distinguish "lint passed cleanly" from "we couldn't read output".
 */
export function parseOxlintIssues(stdout) {
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
/**
 * Run lint and return a structured result. Prefers `oxlint`; falls back to
 * `pnpm lint` only when `oxlint` is missing on PATH. Other spawn errors
 * surface explicitly via `spawnError` rather than being silently rerouted.
 */
export async function runLint(options = {}) {
    const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {});
    const runOptions = {
        timeoutMs: options.timeoutMs ?? DEFAULT_LINT_TIMEOUT_MS,
        signal: options.signal,
        cwd,
    };
    const oxlintArgs = ['--format=json'];
    if (options.fix)
        oxlintArgs.push('--fix');
    if (options.files && options.files.length > 0) {
        oxlintArgs.push(...options.files);
    }
    else {
        oxlintArgs.push('.');
    }
    const oxlintOutcome = await runCommand('oxlint', oxlintArgs, runOptions);
    if (!isRunFailure(oxlintOutcome)) {
        const { issues, parseError } = parseOxlintIssues(oxlintOutcome.stdout);
        return {
            passed: oxlintOutcome.exitCode === 0,
            issues,
            backend: 'oxlint',
            exitCode: oxlintOutcome.exitCode,
            output: oxlintOutcome.stderr || undefined,
            parseError,
            timedOut: oxlintOutcome.timedOut || undefined,
            aborted: oxlintOutcome.aborted || undefined,
        };
    }
    if (!isMissingBinary(oxlintOutcome)) {
        return {
            passed: false,
            issues: [],
            backend: 'oxlint',
            exitCode: 1,
            spawnError: `oxlint spawn failed: ${oxlintOutcome.error.code ?? 'unknown'} ${oxlintOutcome.error.message}`,
        };
    }
    const pnpmOutcome = await runCommand('pnpm', ['lint'], runOptions);
    if (isRunFailure(pnpmOutcome)) {
        return {
            passed: false,
            issues: [],
            backend: 'pnpm',
            exitCode: 1,
            spawnError: `oxlint missing and pnpm spawn failed: ${pnpmOutcome.error.message}`,
        };
    }
    return {
        passed: pnpmOutcome.exitCode === 0,
        issues: [],
        backend: 'pnpm',
        exitCode: pnpmOutcome.exitCode,
        output: [pnpmOutcome.stdout, pnpmOutcome.stderr].filter(Boolean).join('') || undefined,
        timedOut: pnpmOutcome.timedOut || undefined,
        aborted: pnpmOutcome.aborted || undefined,
    };
}
//# sourceMappingURL=index.js.map