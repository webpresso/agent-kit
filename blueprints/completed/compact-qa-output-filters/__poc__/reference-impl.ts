/**
 * Reference implementation for the four compact-output transforms.
 *
 * Status: PoC artifact — NOT shipped code. Lives under the blueprint to
 * pin design decisions for the implementation tasks.
 *
 * Design principles:
 *
 *   SOLID — Single Responsibility per file:
 *     - oxlint / vitest / tsc each own ONE tool's parser
 *     - dispatcher owns lookup + tier ladder, nothing else
 *     - no inheritance, no plugin lifecycle, no abstract base
 *
 *   DRY — One `Failure` type, one `TransformResult` envelope, one tier ladder
 *     `runTiers(...)` helper. Each transform contributes parse/regex/empty
 *     functions; the ladder runs them in order.
 *
 *   KISS — Plain functions, plain types. No classes, no decorators, no DI.
 *     Tier 3 (passthrough) is the existing `clipRawOutput`.
 *
 * Verified facts (PoC 1-6, 2026-05-06):
 *   - oxlint@1.61 emits `{diagnostics: [{code: "eslint(no-X)", filename, severity, labels: [{span: {line, column}}], message}], number_of_files, ...}`
 *   - vitest@4.1.5 emits `{numTotalTests, numFailedTests, success, testResults: [{name, assertionResults: [{fullName, status, failureMessages: [string]}]}]}`
 *   - vitest under `pnpm test --` does NOT forward `--reporter=json` correctly (the `--` separator clobbers args)
 *   - vitest under `pnpm -F <pkg> exec vitest run --reporter=json <file>` DOES emit clean JSON, zero framing, 96% reduction
 *   - tsc regex `/^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/m` (already in agent-kit/src/mcp/tools/typecheck.ts) handles both formats
 *   - ak-pretool-guard already denies pnpm/just/vitest/oxlint/tsc and points at MCP tools
 */

// ─── shared types ───────────────────────────────────────────────────────────

export interface Failure {
  /** path:line OR `<package>` for top-level. */
  readonly location: string
  /** What failed (test name, rule id, error code). */
  readonly what: string
  /** One-line human reason. */
  readonly reason: string
  /** Optional tag for de-dup grouping (rule id, error code). */
  readonly group?: string
}

export interface TransformResult {
  readonly ok: boolean
  readonly failures: readonly Failure[]
  /** Bytes of the compact rendering for budget assertions. */
  readonly bytes: number
  /** 1 = full structured parse, 2 = regex fallback, 3 = passthrough. */
  readonly tier: 1 | 2 | 3
  /** Path to the full log on disk for follow-up via ctx_execute_file. */
  readonly logPath?: string
}

export interface TransformContext {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly logPath?: string
}

/** A transform contributes three pure parsers; the ladder picks the first that returns failures. */
export interface TransformParsers {
  /** Tier 1 — full structured parse. Return null if input doesn't match the structured shape. */
  parseStructured(stdout: string): readonly Failure[] | null
  /** Tier 2 — regex fallback over summary lines. Return null if no signal at all. */
  parseRegex(stdout: string, stderr: string): readonly Failure[] | null
  /** What "no failures" looks like for this tool (e.g., exitCode === 0 for vitest). */
  isClean(ctx: TransformContext): boolean
}

// ─── tier ladder (DRY: every transform routes through this) ─────────────────

export function runTiers(
  parsers: TransformParsers,
  ctx: TransformContext,
  passthrough: (ctx: TransformContext) => string,
): TransformResult {
  if (parsers.isClean(ctx)) {
    return { ok: true, failures: [], bytes: 0, tier: 1, logPath: ctx.logPath }
  }

  const t1 = parsers.parseStructured(ctx.stdout)
  if (t1 !== null) {
    const rendered = renderFailures(t1)
    return {
      ok: t1.length === 0,
      failures: t1,
      bytes: rendered.length,
      tier: 1,
      logPath: ctx.logPath,
    }
  }

  const t2 = parsers.parseRegex(ctx.stdout, ctx.stderr)
  if (t2 !== null) {
    const rendered = renderFailures(t2)
    return {
      ok: t2.length === 0,
      failures: t2,
      bytes: rendered.length,
      tier: 2,
      logPath: ctx.logPath,
    }
  }

  const fallback = passthrough(ctx)
  return {
    ok: ctx.exitCode === 0,
    failures: [],
    bytes: fallback.length,
    tier: 3,
    logPath: ctx.logPath,
  }
}

function renderFailures(failures: readonly Failure[]): string {
  return failures.map((f) => `${f.location}: ${f.what} — ${f.reason}`).join('\n')
}

// ─── oxlint transform (verified shape from PoC 1) ──────────────────────────

interface OxlintDiagnostic {
  code: string // e.g. "eslint(no-debugger)"
  filename: string
  message: string
  severity: 'error' | 'warning'
  labels: ReadonlyArray<{ span: { line: number; column: number } }>
}

interface OxlintShape {
  diagnostics: readonly OxlintDiagnostic[]
}

export const oxlintParsers: TransformParsers = {
  parseStructured(stdout: string): readonly Failure[] | null {
    const json = extractJsonObject(stdout)
    if (!json) return null
    const parsed = safeJsonParse<OxlintShape>(json)
    if (!isOxlintShape(parsed)) return null
    return parsed.diagnostics
      .filter((d: OxlintDiagnostic) => d.severity === 'error')
      .map((d: OxlintDiagnostic): Failure => {
        const line = d.labels[0]?.span.line ?? 0
        const rule = unwrapRuleCode(d.code)
        return {
          location: `${d.filename}:${line}`,
          what: rule,
          reason: d.message,
          group: rule,
        }
      })
  },
  parseRegex(stdout: string): readonly Failure[] | null {
    // oxlint default text format: "src/foo.ts:5:1: error: <msg>"
    const re = /^(.+?):(\d+):\d+:\s+(error|warning):\s+(.+)$/gm
    const out: Failure[] = []
    for (const m of stdout.matchAll(re)) {
      if (m[3] !== 'error') continue
      out.push({ location: `${m[1]}:${m[2]}`, what: 'lint', reason: m[4] })
    }
    return out.length > 0 ? out : null
  },
  isClean(ctx: TransformContext): boolean {
    return ctx.exitCode === 0
  },
}

function unwrapRuleCode(code: string): string {
  // "eslint(no-debugger)" → "no-debugger"
  const m = /^[a-z-]+\(([^)]+)\)$/.exec(code)
  return m?.[1] ?? code
}

function isOxlintShape(value: unknown): value is OxlintShape {
  if (value === null || typeof value !== 'object') return false
  const v = value as { diagnostics?: unknown }
  return Array.isArray(v.diagnostics)
}

// ─── vitest transform (verified shape from PoC 4 against vitest@4.1.5) ─────

interface VitestAssertion {
  fullName: string
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo'
  failureMessages: readonly string[]
}

interface VitestTestResult {
  name: string
  assertionResults: readonly VitestAssertion[]
}

interface VitestShape {
  numTotalTests: number
  numFailedTests: number
  success: boolean
  testResults: readonly VitestTestResult[]
}

export const vitestParsers: TransformParsers = {
  parseStructured(stdout: string): readonly Failure[] | null {
    const json = extractJsonObject(stdout)
    if (!json) return null
    const parsed = safeJsonParse<VitestShape>(json)
    if (!isVitestShape(parsed)) return null
    return parsed.testResults.flatMap((tr: VitestTestResult) =>
      tr.assertionResults
        .filter((a: VitestAssertion) => a.status === 'failed')
        .map(
          (a: VitestAssertion): Failure => ({
            location: tr.name,
            what: a.fullName,
            reason: firstStackLine(a.failureMessages[0] ?? '(no message)'),
          }),
        ),
    )
  },
  parseRegex(stdout: string): readonly Failure[] | null {
    // Tier 2: pull the summary line if JSON is missing.
    //   "Tests  N failed | M passed (T)" → emit a single synthetic Failure
    const m = /Tests\s+(\d+)\s+failed\s*\|/i.exec(stdout)
    if (!m) return null
    const failed = Number(m[1])
    return failed > 0
      ? [
          {
            location: '<vitest>',
            what: 'tests',
            reason: `${failed} failed (regex fallback; JSON unavailable)`,
          },
        ]
      : []
  },
  isClean(ctx: TransformContext): boolean {
    return ctx.exitCode === 0
  },
}

function firstStackLine(stack: string): string {
  return stack.split('\n')[0] ?? stack
}

function isVitestShape(value: unknown): value is VitestShape {
  if (value === null || typeof value !== 'object') return false
  const v = value as { numTotalTests?: unknown; testResults?: unknown }
  return typeof v.numTotalTests === 'number' && Array.isArray(v.testResults)
}

// ─── tsc transform (evolves existing parseTscOutput; verified by PoC 6) ────

interface TscError {
  file: string
  line: number
  code: string
  message: string
}

const TSC_ERROR_LINE = /^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/

export const tscParsers: TransformParsers = {
  parseStructured(stdout: string): readonly Failure[] | null {
    const errors = parseTscErrors(stdout)
    if (errors.length === 0) return null
    return collapseCascades(errors)
  },
  parseRegex(): readonly Failure[] | null {
    return null // tsc has no separate regex tier — the structured parser IS regex-based
  },
  isClean(ctx: TransformContext): boolean {
    return ctx.exitCode === 0
  },
}

function parseTscErrors(stdout: string): readonly TscError[] {
  const errors: TscError[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const m = TSC_ERROR_LINE.exec(line)
    if (!m) continue
    const [, file, paren, colon, code, message] = m
    errors.push({
      file: file ?? '',
      line: Number(paren ?? colon ?? '0'),
      code: code ?? '',
      message: (message ?? '').trim(),
    })
  }
  return errors
}

function collapseCascades(errors: readonly TscError[]): readonly Failure[] {
  // Group by file → bucket by (code, message-prefix) → collapse repeats.
  const byFile = new Map<string, TscError[]>()
  for (const e of errors) {
    const bucket = byFile.get(e.file) ?? []
    bucket.push(e)
    byFile.set(e.file, bucket)
  }
  const out: Failure[] = []
  for (const [file, fileErrors] of byFile) {
    const seen = new Map<string, { code: string; msg: string; lines: number[] }>()
    for (const e of fileErrors) {
      const key = `TS${e.code}|${e.message.slice(0, 40)}`
      const entry = seen.get(key) ?? { code: e.code, msg: e.message, lines: [] }
      entry.lines.push(e.line)
      seen.set(key, entry)
    }
    for (const entry of seen.values()) {
      const lineLabel =
        entry.lines.length === 1
          ? String(entry.lines[0])
          : `${entry.lines.join(',')} (×${entry.lines.length})`
      out.push({
        location: `${file}:${lineLabel}`,
        what: `TS${entry.code}`,
        reason: entry.msg,
        group: `TS${entry.code}`,
      })
    }
  }
  return out
}

// ─── shared helpers ────────────────────────────────────────────────────────

/**
 * Find the first balanced JSON object in a string. Tolerates leading/trailing
 * non-JSON framing (vp wrappers, pnpm script banners). Returns null if not found.
 */
export function extractJsonObject(input: string): string | null {
  const start = input.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < input.length; i++) {
    const ch = input[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return input.slice(start, i + 1)
    }
  }
  return null
}

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T
  } catch {
    return null
  }
}

// ─── dispatcher (Tier ladder + name normalization, F29) ────────────────────

const TRANSFORMS: Readonly<Record<string, TransformParsers>> = {
  oxlint: oxlintParsers,
  vitest: vitestParsers,
  tsc: tscParsers,
}

/** Strip dynamic suffixes — `ak_audit-blueprint-lifecycle` → `audit`. */
export function normalizeToolName(toolName: string): string {
  return toolName.replace(/^ak_/, '').split('-')[0]!
}

export function applyTransform(
  toolName: string,
  ctx: TransformContext,
  passthrough: (ctx: TransformContext) => string,
): TransformResult {
  const key = normalizeToolName(toolName)
  const parsers = TRANSFORMS[key]
  if (!parsers) {
    const out = passthrough(ctx)
    return {
      ok: ctx.exitCode === 0,
      failures: [],
      bytes: out.length,
      tier: 3,
      logPath: ctx.logPath,
    }
  }
  return runTiers(parsers, ctx, passthrough)
}
