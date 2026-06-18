/**
 * `wp_lint` MCP tool.
 *
 * Runs `vp lint` on the supplied files (or `.` when none are given). Returns a
 * structured payload:
 *
 *   {
 *     passed: boolean,
 *     issues: Array<{file, line, rule, message}>,
 *     exitCode: number,
 *   }
 *
 * `vp lint --format=json` forwards to the bundled Oxlint engine while keeping
 * the repo command surface on the `vp` facade.
 */

import { z } from 'zod'

import { sharedOxlintConfigArgs } from '#config/oxlint/shared-config-path'
import type { ToolDescriptor } from '#mcp/auto-discover'

import { formatMcpToolOutput } from './_shared/full-output.js'
import { resolveProjectRoot } from './_shared/project-root.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { isRunFailure, runCommand } from './_shared/run-command.js'

const inputSchema = z.object({
  cwd: z.string().optional(),
  files: z.array(z.string()).optional(),
  fix: z.boolean().optional().default(false),
  full: z.boolean().optional().default(false),
})

export type AkLintInput = z.infer<typeof inputSchema>

const lintIssueSchema = z.object({
  file: z.string(),
  line: z.number(),
  rule: z.string(),
  message: z.string(),
})

const outputSchema = createSummaryOutputSchema({
  counts: z.object({
    issueCount: z.number(),
  }),
  details: z.object({
    issues: z.array(lintIssueSchema),
    parseError: z.string().optional(),
    spawnError: z.string().optional(),
  }),
})

// Hard cap so a hung lint cannot hang the MCP tool. Lints over 5 minutes are
// pathological; surface them as a timeout signal instead of a silent stall.
const LINT_COMMAND_TIMEOUT_MS = 5 * 60 * 1_000

interface LintIssue {
  readonly file: string
  readonly line: number
  readonly rule: string
  readonly message: string
}

interface OxlintMessage {
  readonly line?: number
  readonly ruleId?: string | null
  readonly message?: string
  readonly filename?: string
  readonly labels?: readonly {
    readonly span?: {
      readonly line?: number
    }
  }[]
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
 * Parse oxlint's `--format=json` output into our flattened issue list.
 *
 * oxlint emits an ESLint-compatible array: `[{filePath, messages: [...]}, ...]`.
 * On JSON parse failure or unexpected shape we annotate the outcome with a
 * concrete `parseError` instead of silently returning an empty list — the
 * caller can then distinguish "lint passed cleanly" from "we couldn't read
 * lint's output."
 */
function parseOxlintIssues(stdout: string): ParseOutcome {
  const trimmed = stdout.trim()
  if (!trimmed) return { issues: [] }
  const jsonText = extractJsonObjectOrArray(trimmed) ?? trimmed
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { issues: [], parseError: `oxlint JSON.parse failed: ${reason}` }
  }
  const reports = Array.isArray(parsed)
    ? (parsed as OxlintFileReport[])
    : normalizeWrappedOxlintReports(parsed)
  if (!Array.isArray(reports))
    return { issues: [], parseError: 'oxlint output was not a JSON array' }
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

function normalizeWrappedOxlintReports(parsed: unknown): OxlintFileReport[] | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined
  const wrapper = parsed as {
    diagnostics?: unknown[]
    results?: unknown[]
  }
  const reports = wrapper.diagnostics ?? wrapper.results
  if (!Array.isArray(reports)) return undefined
  if (reports.every((report) => report && typeof report === 'object' && 'message' in report)) {
    return reports.map((report) => {
      const message = report as OxlintMessage
      return {
        filePath: message.filename ?? '',
        messages: [
          {
            line: message.line ?? message.labels?.[0]?.span?.line ?? 0,
            ruleId: message.ruleId ?? 'parse',
            message: message.message ?? '',
          },
        ],
      }
    })
  }
  return reports as OxlintFileReport[]
}

function extractJsonObjectOrArray(raw: string): string | undefined {
  const start = raw.search(/[[{]/u)
  if (start < 0) return undefined
  const open = raw[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    if (char === open) depth += 1
    if (char === close) depth -= 1
    if (depth === 0) return raw.slice(start, index + 1)
  }
  return undefined
}

function summarizeLintResult(options: {
  passed: boolean
  issueCount: number
  exitCode: number
  parseError?: string
  timedOut?: boolean
  aborted?: boolean
}): string {
  if (options.timedOut) return 'lint timed out via vp lint'
  if (options.aborted) return 'lint aborted via vp lint'
  if (options.parseError) return 'lint failed: could not parse vp lint output'
  if (options.passed) return 'lint passed via vp lint'
  if (options.issueCount > 0) {
    return `lint failed with ${options.issueCount} issue${options.issueCount === 1 ? '' : 's'} via vp lint`
  }
  return `lint failed via vp lint (exit ${options.exitCode})`
}

const tool: ToolDescriptor = {
  name: 'wp_lint',
  description:
    'Run lint via the `vp lint` facade. Returns `{passed, issues: [{file, line, rule, message}]}`.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Lint',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw, extra) => {
    const input = inputSchema.parse(raw ?? {})
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    const runOptions = {
      timeoutMs: LINT_COMMAND_TIMEOUT_MS,
      signal: extra?.signal,
      cwd,
    }

    const lintArgs: string[] = ['lint', '--format=json']
    // Inject agent-kit's shared --config so consumers need no local oxlint
    // config (Tier-1 DRY). No-op when the consumer ships its own config.
    lintArgs.push(...sharedOxlintConfigArgs(cwd, lintArgs))
    if (input.fix) lintArgs.push('--fix')
    if (input.files && input.files.length > 0) {
      lintArgs.push(...input.files)
    } else {
      lintArgs.push('.')
    }

    const vpOutcome = await runCommand('vp', lintArgs, runOptions)

    if (!isRunFailure(vpOutcome)) {
      const { issues, parseError } = parseOxlintIssues(vpOutcome.stdout)
      const compact = formatMcpToolOutput(vpOutcome.stdout || vpOutcome.stderr, {
        toolName: 'wp_lint-vp',
        full: input.full,
      })
      const payload = {
        passed: vpOutcome.exitCode === 0,
        summary: summarizeLintResult({
          passed: vpOutcome.exitCode === 0,
          issueCount: issues.length,
          exitCode: vpOutcome.exitCode,
          parseError,
          timedOut: vpOutcome.timedOut,
          aborted: vpOutcome.aborted,
        }),
        exitCode: vpOutcome.exitCode,
        counts: { issueCount: issues.length },
        details: {
          issues,
          parseError,
        },
        ...compact,
        timedOut: vpOutcome.timedOut || undefined,
        aborted: vpOutcome.aborted || undefined,
      }
      return createSummaryResult(payload)
    }

    const payload = {
      passed: false,
      summary: 'lint could not start: vp lint spawn failed',
      exitCode: 1,
      counts: { issueCount: 0 },
      details: {
        issues: [] as LintIssue[],
        spawnError: `vp lint spawn failed: ${vpOutcome.error.code ?? 'unknown'} ${vpOutcome.error.message}`,
      },
    }
    return createSummaryResult(payload, { isError: true })
  },
}

export default tool
