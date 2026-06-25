/**
 * Stable subpath export: `webpresso/lint`.
 *
 * Exposes a framework-friendly `runLint` runner that uses the `vp lint`
 * facade. Mirrors the semantics of the `wp_lint` MCP tool but returns a
 * typed result object directly so external scaffolders can consume it without
 * reaching through the MCP transport.
 */

import { sharedOxlintConfigArgs } from "#config/oxlint/shared-config-path";
import { isRunFailure, runCommand } from "#mcp/tools/_shared/run-command";
import { resolveProjectRoot } from "#mcp/tools/_shared/project-root";
import { getManagedRunner } from "#tool-runtime";

export interface LintIssue {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly message: string;
}

export interface LintResult {
  readonly passed: boolean;
  readonly issues: readonly LintIssue[];
  readonly exitCode: number;
  readonly output?: string;
  readonly parseError?: string;
  readonly spawnError?: string;
  readonly timedOut?: boolean;
  readonly aborted?: boolean;
}

export interface RunLintOptions {
  /** Files or glob targets to lint. When omitted, lints `.` */
  readonly files?: readonly string[];
  /** Apply autofixes via `vp lint --fix`. */
  readonly fix?: boolean;
  /** Override the resolved project root. */
  readonly cwd?: string;
  /** Hard cap on the spawned process. Defaults to 5 minutes. */
  readonly timeoutMs?: number;
  /** Optional cancellation signal propagated to the child process. */
  readonly signal?: AbortSignal;
}

const DEFAULT_LINT_TIMEOUT_MS = 5 * 60 * 1_000;

interface OxlintMessage {
  readonly line?: number;
  readonly ruleId?: string | null;
  readonly message?: string;
}

interface OxlintFileReport {
  readonly filePath?: string;
  readonly messages?: readonly OxlintMessage[];
}

interface ParseOutcome {
  readonly issues: LintIssue[];
  readonly parseError?: string;
}

/**
 * Parse oxlint's `--format=json` output (ESLint-compatible array shape) into
 * a flat issue list. Annotates `parseError` on JSON or shape failure so the
 * caller can distinguish "lint passed cleanly" from "we couldn't read output".
 */
export function parseOxlintIssues(stdout: string): ParseOutcome {
  const trimmed = stdout.trim();
  if (!trimmed) return { issues: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { issues: [], parseError: `oxlint JSON.parse failed: ${reason}` };
  }
  // Newer oxlint emits a wrapped object `{ diagnostics: [...] }` rather than
  // an ESLint-shaped array. Normalize both shapes so callers see one issue list.
  const reports = Array.isArray(parsed)
    ? (parsed as OxlintFileReport[])
    : normalizeWrappedReports(parsed);
  if (!reports) {
    return { issues: [], parseError: "oxlint output was not a JSON array" };
  }
  const issues: LintIssue[] = [];
  for (const fileReport of reports) {
    const file = fileReport?.filePath ?? "";
    const messages = fileReport?.messages;
    if (!Array.isArray(messages)) continue;
    for (const m of messages) {
      issues.push({
        file,
        line: typeof m.line === "number" ? m.line : 0,
        rule: m.ruleId ?? "",
        message: m.message ?? "",
      });
    }
  }
  return { issues };
}

interface OxlintWrappedDiagnostic {
  readonly filename?: string;
  readonly message?: string;
  readonly code?: string;
  readonly ruleId?: string | null;
  readonly line?: number;
  readonly labels?: readonly { readonly span?: { readonly line?: number } }[];
}

function normalizeWrappedReports(parsed: unknown): OxlintFileReport[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  const wrapper = parsed as { diagnostics?: unknown; results?: unknown };
  const reports = wrapper.diagnostics ?? wrapper.results;
  if (!Array.isArray(reports)) return null;
  return reports.map((report) => {
    const d = report as OxlintWrappedDiagnostic;
    return {
      filePath: d.filename ?? "",
      messages: [
        {
          line: d.line ?? d.labels?.[0]?.span?.line ?? 0,
          ruleId: d.ruleId ?? d.code ?? "parse",
          message: d.message ?? "",
        },
      ],
    };
  });
}

/**
 * Run lint via `vp lint` and return a structured result. Spawn failures surface
 * explicitly via `spawnError`.
 */
export async function runLint(options: RunLintOptions = {}): Promise<LintResult> {
  const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {});
  const runOptions = {
    timeoutMs: options.timeoutMs ?? DEFAULT_LINT_TIMEOUT_MS,
    signal: options.signal,
    cwd,
  };

  const lintArgs: string[] = ["lint", "--format=json"];
  // Inject agent-kit's shared --config so consumers need no local oxlint config
  // (Tier-1 DRY). No-op when the consumer ships its own config or passes
  // --config (see sharedOxlintConfigArgs).
  lintArgs.push(...sharedOxlintConfigArgs(cwd, lintArgs));
  if (options.fix) lintArgs.push("--fix");
  if (options.files && options.files.length > 0) {
    lintArgs.push(...options.files);
  } else {
    lintArgs.push(".");
  }

  const resolution = getManagedRunner("vp", { outputPolicy: "structured" });
  const vpOutcome = await runCommand(
    resolution.command,
    [...resolution.args, ...lintArgs],
    runOptions,
  );
  if (isRunFailure(vpOutcome)) {
    return {
      passed: false,
      issues: [],
      exitCode: 1,
      spawnError: `vp lint spawn failed: ${vpOutcome.error.code ?? "unknown"} ${vpOutcome.error.message}`,
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
