/**
 * Stable subpath export: `@webpresso/agent-kit/lint`.
 *
 * Exposes a framework-friendly `runLint` runner that wraps `oxlint`
 * (preferred — fast, structured JSON output) with a `vp run lint` fallback
 * when `oxlint` is not on PATH. Mirrors the semantics of the
 * `ak_lint` MCP tool but returns a typed result object directly so
 * external scaffolders (e.g. webpresso-framework Wave 2) can consume it
 * without reaching through the MCP transport.
 */

import { isMissingBinary, isRunFailure, runCommand } from '#mcp/tools/_shared/run-command'
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root'

export interface LintIssue {
  readonly file: string
  readonly line: number
  readonly rule: string
  readonly message: string
}

export type LintBackend = 'oxlint' | 'vp'

export interface LintResult {
  readonly passed: boolean
  readonly issues: readonly LintIssue[]
  readonly backend: LintBackend
  readonly exitCode: number
  readonly output?: string
  readonly parseError?: string
  readonly spawnError?: string
  readonly timedOut?: boolean
  readonly aborted?: boolean
}

export interface RunLintOptions {
  /** Files or glob targets to lint. When omitted, lints `.` */
  readonly files?: readonly string[]
/** Apply autofixes via `oxlint --fix`. Ignored on the vp fallback. */
  readonly fix?: boolean
  /** Override the resolved project root. */
  readonly cwd?: string
  /** Hard cap on the spawned process. Defaults to 5 minutes. */
  readonly timeoutMs?: number
  /** Optional cancellation signal propagated to the child process. */
  readonly signal?: AbortSignal
}

const DEFAULT_LINT_TIMEOUT_MS = 5 * 60 * 1_000

interface OxlintMessage {
  readonly line?: number
  readonly ruleId?: string | null
  readonly message?: string
}

interface OxlintFileReport {
  readonly filePath?: string
  readonly messages?: readonly OxlintMessage[]
}

interface ParseOutcome {
  readonly issues: LintIssue[]
  readonly parseError?: string
}

/**
 * Parse oxlint's `--format=json` output (ESLint-compatible array shape) into
 * a flat issue list. Annotates `parseError` on JSON or shape failure so the
 * caller can distinguish "lint passed cleanly" from "we couldn't read output".
 */
export function parseOxlintIssues(stdout: string): ParseOutcome {
  const trimmed = stdout.trim()
  if (!trimmed) return { issues: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { issues: [], parseError: `oxlint JSON.parse failed: ${reason}` }
  }
  // Newer oxlint emits a wrapped object `{ diagnostics: [...] }` rather than
  // an ESLint-shaped array. Normalize both shapes so callers see one issue list.
  const reports = Array.isArray(parsed)
    ? (parsed as OxlintFileReport[])
    : normalizeWrappedReports(parsed)
  if (!reports) {
    return { issues: [], parseError: 'oxlint output was not a JSON array' }
  }
  const issues: LintIssue[] = []
  for (const fileReport of reports) {
    const file = fileReport?.filePath ?? ''
    const messages = fileReport?.messages
    if (!Array.isArray(messages)) continue
    for (const m of messages) {
      issues.push({
        file,
        line: typeof m.line === 'number' ? m.line : 0,
        rule: m.ruleId ?? '',
        message: m.message ?? '',
      })
    }
  }
  return { issues }
}

interface OxlintWrappedDiagnostic {
  readonly filename?: string
  readonly message?: string
  readonly code?: string
  readonly ruleId?: string | null
  readonly line?: number
  readonly labels?: readonly { readonly span?: { readonly line?: number } }[]
}

function normalizeWrappedReports(parsed: unknown): OxlintFileReport[] | null {
  if (!parsed || typeof parsed !== 'object') return null
  const wrapper = parsed as { diagnostics?: unknown; results?: unknown }
  const reports = wrapper.diagnostics ?? wrapper.results
  if (!Array.isArray(reports)) return null
  return reports.map((report) => {
    const d = report as OxlintWrappedDiagnostic
    return {
      filePath: d.filename ?? '',
      messages: [
        {
          line: d.line ?? d.labels?.[0]?.span?.line ?? 0,
          ruleId: d.ruleId ?? d.code ?? 'parse',
          message: d.message ?? '',
        },
      ],
    }
  })
}

/**
 * Run lint and return a structured result. Prefers `oxlint`; falls back to
 * `vp run lint` only when `oxlint` is missing on PATH. Other spawn errors
 * surface explicitly via `spawnError` rather than being silently rerouted.
 */
export async function runLint(options: RunLintOptions = {}): Promise<LintResult> {
  const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {})
  const runOptions = {
    timeoutMs: options.timeoutMs ?? DEFAULT_LINT_TIMEOUT_MS,
    signal: options.signal,
    cwd,
  }

  const oxlintArgs: string[] = ['--format=json']
  if (options.fix) oxlintArgs.push('--fix')
  if (options.files && options.files.length > 0) {
    oxlintArgs.push(...options.files)
  } else {
    oxlintArgs.push('.')
  }

  const oxlintOutcome = await runCommand('oxlint', oxlintArgs, runOptions)

  if (!isRunFailure(oxlintOutcome)) {
    const { issues, parseError } = parseOxlintIssues(oxlintOutcome.stdout)
    return {
      passed: oxlintOutcome.exitCode === 0,
      issues,
      backend: 'oxlint',
      exitCode: oxlintOutcome.exitCode,
      output: oxlintOutcome.stderr || undefined,
      parseError,
      timedOut: oxlintOutcome.timedOut || undefined,
      aborted: oxlintOutcome.aborted || undefined,
    }
  }

  if (!isMissingBinary(oxlintOutcome)) {
    return {
      passed: false,
      issues: [],
      backend: 'oxlint',
      exitCode: 1,
      spawnError: `oxlint spawn failed: ${oxlintOutcome.error.code ?? 'unknown'} ${oxlintOutcome.error.message}`,
    }
  }

  const vpOutcome = await runCommand('vp', ['run', 'lint'], runOptions)
  if (isRunFailure(vpOutcome)) {
    return {
      passed: false,
      issues: [],
      backend: 'vp',
      exitCode: 1,
      spawnError: `oxlint missing and vp spawn failed: ${vpOutcome.error.message}`,
    }
  }

  return {
    passed: vpOutcome.exitCode === 0,
    issues: [],
    backend: 'vp',
    exitCode: vpOutcome.exitCode,
    output: [vpOutcome.stdout, vpOutcome.stderr].filter(Boolean).join('') || undefined,
    timedOut: vpOutcome.timedOut || undefined,
    aborted: vpOutcome.aborted || undefined,
  }
}
