/**
 * Stable subpath export: `@webpresso/agent-kit/typecheck`.
 *
 * Exposes a framework-friendly `runTypecheck` runner that wraps
 * `tsc --noEmit` either at cwd (no `packages` given) or once per resolved
 * package path (each becomes `tsc --noEmit -p <pkg>/tsconfig.json`). Mirrors
 * the semantics of the `ak_typecheck` MCP tool but returns a typed result
 * directly so external scaffolders can consume it without the MCP transport.
 */
import { join } from 'node:path';
import { isRunFailure, runCommand } from '#mcp/tools/_shared/run-command';
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root';
const DEFAULT_TYPECHECK_TIMEOUT_MS = 10 * 60 * 1_000;
// Matches both standard tsc formats:
//   src/foo.ts(5,12): error TS2304: Cannot find name 'bar'.
//   src/foo.ts:5:12 - error TS2304: Cannot find name 'bar'.
const ERROR_LINE = /^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/;
/**
 * Parse `tsc --noEmit` stdout into structured `{file, line, code, message}`
 * entries. Lines that don't match the diagnostic format are ignored so
 * preamble/`tsc` chatter never ends up in the error list.
 */
export function parseTscOutput(raw) {
    const errors = [];
    for (const rawLine of raw.split('\n')) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const match = ERROR_LINE.exec(line);
        if (!match)
            continue;
        const [, file, paren, colon, code, message] = match;
        const lineNumber = paren ?? colon ?? '0';
        errors.push({
            file: file ?? '',
            line: Number(lineNumber),
            code: code ?? '',
            message: (message ?? '').trim(),
        });
    }
    return errors;
}
/**
 * Run typecheck and return structured diagnostics. When `packages` is
 * provided, runs `tsc --noEmit -p <pkg>/tsconfig.json` once per entry
 * sequentially and aggregates output; otherwise a single root-level
 * `tsc --noEmit`. Throws on spawn failures (e.g. tsc missing) — those
 * indicate a misconfigured environment, not a typecheck verdict.
 */
export async function runTypecheck(options = {}) {
    const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {});
    const runOptions = {
        timeoutMs: options.timeoutMs ?? DEFAULT_TYPECHECK_TIMEOUT_MS,
        signal: options.signal,
        cwd,
    };
    const targets = options.packages && options.packages.length > 0 ? options.packages : null;
    const runs = [];
    if (targets) {
        for (const pkg of targets) {
            const tsconfig = join(pkg, 'tsconfig.json');
            const outcome = await runCommand('tsc', ['--noEmit', '-p', tsconfig], runOptions);
            if (isRunFailure(outcome)) {
                throw outcome.error;
            }
            runs.push(outcome);
        }
    }
    else {
        const outcome = await runCommand('tsc', ['--noEmit'], runOptions);
        if (isRunFailure(outcome)) {
            throw outcome.error;
        }
        runs.push(outcome);
    }
    const combinedStdout = runs.map((r) => r.stdout).join('');
    const combinedStderr = runs.map((r) => r.stderr).join('');
    const errors = parseTscOutput(combinedStdout);
    const passed = runs.every((r) => r.exitCode === 0);
    const timedOut = runs.some((r) => r.timedOut);
    const aborted = runs.some((r) => r.aborted);
    return {
        passed,
        errorCount: errors.length,
        errors,
        output: [combinedStdout, combinedStderr].filter(Boolean).join(''),
        timedOut: timedOut || undefined,
        aborted: aborted || undefined,
    };
}
//# sourceMappingURL=index.js.map