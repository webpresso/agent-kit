/**
 * Stable subpath export: `webpresso/typecheck`.
 *
 * Exposes a framework-friendly `runTypecheck` runner that mirrors the
 * semantics of the `wp_typecheck` MCP tool without the MCP transport.
 */
import { isRunFailure, runCommand } from "#mcp/tools/_shared/run-command";
import { resolveProjectRoot } from "#mcp/tools/_shared/project-root";
import { planTypecheckExecution } from "./planner.js";
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
    for (const rawLine of raw.split("\n")) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const match = ERROR_LINE.exec(line);
        if (!match)
            continue;
        const [, file, paren, colon, code, message] = match;
        const lineNumber = paren ?? colon ?? "0";
        errors.push({
            file: file ?? "",
            line: Number(lineNumber),
            code: code ?? "",
            message: (message ?? "").trim(),
        });
    }
    return errors;
}
/**
 * Run typecheck and return structured diagnostics. When `packages` is
 * provided, resolves exact package scopes; when `files` is provided, resolves
 * each file to its owning scope; otherwise it preserves the existing root
 * typecheck behavior. Throws on spawn failures (e.g. tsc missing) — those
 * indicate a misconfigured environment, not a typecheck verdict.
 */
export async function runTypecheck(options = {}) {
    if (options.files &&
        options.files.length > 0 &&
        options.packages &&
        options.packages.length > 0) {
        throw new Error("Cannot use both files and packages for typecheck targeting.");
    }
    const repoRoot = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {});
    const runOptions = {
        timeoutMs: options.timeoutMs ?? DEFAULT_TYPECHECK_TIMEOUT_MS,
        signal: options.signal,
        cwd: repoRoot,
    };
    const plan = planTypecheckExecution({
        repoRoot,
        defaultScopeRoot: repoRoot,
        files: options.files,
        packages: options.packages,
    });
    const runs = [];
    for (const command of plan.commands) {
        const outcome = await runCommand(command.command, command.args, {
            ...runOptions,
            cwd: command.cwd,
        });
        if (isRunFailure(outcome)) {
            throw outcome.error;
        }
        runs.push(outcome);
    }
    const combinedStdout = runs.map((r) => r.stdout).join("");
    const combinedStderr = runs.map((r) => r.stderr).join("");
    const errors = parseTscOutput(combinedStdout);
    const passed = runs.every((r) => r.exitCode === 0);
    const timedOut = runs.some((r) => r.timedOut);
    const aborted = runs.some((r) => r.aborted);
    const preamble = plan.preambleLine ? `${plan.preambleLine}\n` : "";
    return {
        passed,
        errorCount: errors.length,
        errors,
        output: [preamble, combinedStdout, combinedStderr].filter(Boolean).join(""),
        timedOut: timedOut || undefined,
        aborted: aborted || undefined,
    };
}
//# sourceMappingURL=index.js.map