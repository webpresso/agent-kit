/**
 * Stable subpath export: `webpresso/typecheck`.
 *
 * Exposes a framework-friendly `runTypecheck` runner that mirrors the
 * semantics of the `wp_typecheck` MCP tool without the MCP transport.
 */

import { isRunFailure, runCommand, type RunResult } from "#mcp/tools/_shared/run-command";
import { resolveProjectRoot } from "#mcp/tools/_shared/project-root";
import { planTypecheckExecution } from "./planner.js";

export interface TscError {
  readonly file: string;
  readonly line: number;
  readonly code: string;
  readonly message: string;
}

export interface TypecheckResult {
  readonly passed: boolean;
  readonly errorCount: number;
  readonly errors: readonly TscError[];
  readonly output: string;
  readonly timedOut?: boolean;
  readonly aborted?: boolean;
}

export interface RunTypecheckOptions {
  /**
   * Exact package.json names. When provided, runs one normal typecheck per
   * resolved owning scope.
   */
  readonly packages?: readonly string[];
  /**
   * Source files whose owning scope should be typechecked. This never runs
   * isolated-file TypeScript; it resolves the file(s) to owning scope(s) and
   * runs the normal scope-level typecheck once per resolved scope.
   */
  readonly files?: readonly string[];
  /** Override the resolved project root. */
  readonly cwd?: string;
  /** Hard cap on the spawned process(es). Defaults to 10 minutes. */
  readonly timeoutMs?: number;
  /** Optional cancellation signal propagated to the child process(es). */
  readonly signal?: AbortSignal;
}

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
export function parseTscOutput(raw: string): TscError[] {
  const errors: TscError[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = ERROR_LINE.exec(line);
    if (!match) continue;
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
export async function runTypecheck(options: RunTypecheckOptions = {}): Promise<TypecheckResult> {
  if (
    options.files &&
    options.files.length > 0 &&
    options.packages &&
    options.packages.length > 0
  ) {
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

  const runs: RunResult[] = [];
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
