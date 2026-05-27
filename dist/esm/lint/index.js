/**
 * Stable subpath export: `webpresso/lint`.
 *
 * Exposes a framework-friendly `runLint` runner that uses the `vp lint`
 * facade. Mirrors the semantics of the `wp_lint` MCP tool but returns a
 * typed result object directly so external scaffolders can consume it without
 * reaching through the MCP transport.
 */
import { isRunFailure, runCommand } from '#mcp/tools/_shared/run-command';
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
    // Newer oxlint emits a wrapped object `{ diagnostics: [...] }` rather than
    // an ESLint-shaped array. Normalize both shapes so callers see one issue list.
    const reports = Array.isArray(parsed)
        ? parsed
        : normalizeWrappedReports(parsed);
    if (!reports) {
        return { issues: [], parseError: 'oxlint output was not a JSON array' };
    }
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
function normalizeWrappedReports(parsed) {
    if (!parsed || typeof parsed !== 'object')
        return null;
    const wrapper = parsed;
    const reports = wrapper.diagnostics ?? wrapper.results;
    if (!Array.isArray(reports))
        return null;
    return reports.map((report) => {
        const d = report;
        return {
            filePath: d.filename ?? '',
            messages: [
                {
                    line: d.line ?? d.labels?.[0]?.span?.line ?? 0,
                    ruleId: d.ruleId ?? d.code ?? 'parse',
                    message: d.message ?? '',
                },
            ],
        };
    });
}
/**
 * Run lint via `vp lint` and return a structured result. Spawn failures surface
 * explicitly via `spawnError`.
 */
export async function runLint(options = {}) {
    const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {});
    const runOptions = {
        timeoutMs: options.timeoutMs ?? DEFAULT_LINT_TIMEOUT_MS,
        signal: options.signal,
        cwd,
    };
    const lintArgs = ['lint', '--format=json'];
    if (options.fix)
        lintArgs.push('--fix');
    if (options.files && options.files.length > 0) {
        lintArgs.push(...options.files);
    }
    else {
        lintArgs.push('.');
    }
    const vpOutcome = await runCommand('vp', lintArgs, runOptions);
    if (isRunFailure(vpOutcome)) {
        return {
            passed: false,
            issues: [],
            exitCode: 1,
            spawnError: `vp lint spawn failed: ${vpOutcome.error.code ?? 'unknown'} ${vpOutcome.error.message}`,
        };
    }
    const { issues, parseError } = parseOxlintIssues(vpOutcome.stdout);
    return {
        passed: vpOutcome.exitCode === 0,
        issues,
        exitCode: vpOutcome.exitCode,
        output: vpOutcome.stderr || undefined,
        parseError,
        timedOut: vpOutcome.timedOut || undefined,
        aborted: vpOutcome.aborted || undefined,
    };
}
//# sourceMappingURL=index.js.map