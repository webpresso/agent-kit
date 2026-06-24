/**
 * Stable subpath export: `webpresso/format`.
 *
 * Wraps the bundled `vp fmt` surface behind `wp format`. Mirrors the
 * `runLint` API shape so consumers can compose lint + format in the same
 * pipeline. Unlike `runLint` there is NO fallback — the formatter facade must
 * be available; if missing we surface a clear error naming the missing binary.
 */

import { isMissingBinary, isRunFailure, runCommand } from "#mcp/tools/_shared/run-command";
import { resolveProjectRoot } from "#mcp/tools/_shared/project-root";
import { getManagedRunner } from "#tool-runtime";

export interface FormatResult {
  readonly passed: boolean;
  readonly exitCode: number;
  readonly output: string;
  readonly fixedFiles?: readonly string[];
  readonly spawnError?: string;
  readonly timedOut?: boolean;
  readonly aborted?: boolean;
}

export interface RunFormatOptions {
  /** Files or glob targets. When omitted, `vp fmt`'s default discovery runs. */
  readonly files?: readonly string[];
  /** When true, only check (exit 1 on unformatted). When false/undefined, write fixes. */
  readonly check?: boolean;
  /** Override the resolved project root. */
  readonly cwd?: string;
  /** Hard cap on the spawned process. Defaults to 5 minutes. */
  readonly timeoutMs?: number;
  /** Optional cancellation signal propagated to the child process. */
  readonly signal?: AbortSignal;
}

const DEFAULT_FORMAT_TIMEOUT_MS = 5 * 60 * 1_000;

/**
 * Run formatter and return a structured result. Throws a clear error when the
 * formatter backend is not on PATH (no silent fallback).
 */
export async function runFormat(options: RunFormatOptions = {}): Promise<FormatResult> {
  const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {});
  const runOptions = {
    timeoutMs: options.timeoutMs ?? DEFAULT_FORMAT_TIMEOUT_MS,
    signal: options.signal,
    cwd,
  };

  const args: string[] = [];
  if (options.check) args.push("--check");
  else args.push("--write");
  // Explicit --ignore-path so the repo's catch-all `.prettierignore` does not
  // make file-targeted formatting skip every target.
  args.push("--ignore-path", ".gitignore");
  if (options.files && options.files.length > 0) args.push(...options.files);

  const resolution = getManagedRunner("vp", { outputPolicy: "structured" });
  const outcome = await runCommand(
    resolution.command,
    [...resolution.args, "fmt", ...args],
    runOptions,
  );

  if (isRunFailure(outcome)) {
    if (isMissingBinary(outcome)) {
      throw new Error("formatter backend binary not found on PATH");
    }
    return {
      passed: false,
      exitCode: 1,
      output: "",
      spawnError: `format backend spawn failed: ${outcome.error.code ?? "unknown"} ${outcome.error.message}`,
    };
  }

  return {
    passed: outcome.exitCode === 0,
    exitCode: outcome.exitCode,
    output: [outcome.stdout, outcome.stderr].filter(Boolean).join(""),
    fixedFiles: options.check ? undefined : parseFixedFiles(outcome.stdout),
    timedOut: outcome.timedOut || undefined,
    aborted: outcome.aborted || undefined,
  };
}

/**
 * Best-effort extraction of files `vp fmt` rewrote. The formatter does not
 * currently emit a structured list, so this returns an empty array unless a future version
 * adds machine-readable output. Kept as an opt-in field so downstream callers
 * can opt into richer reporting later without an API break.
 */
function parseFixedFiles(_stdout: string): readonly string[] {
  return [];
}
