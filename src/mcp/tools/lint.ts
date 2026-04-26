/**
 * `ak_lint` MCP tool.
 *
 * Runs `oxlint` (preferred — fast, structured JSON output) on the supplied
 * files (or `.` when none are given). When the `oxlint` binary is absent on
 * PATH, falls back to `pnpm lint`. Returns a structured payload:
 *
 *   {
 *     passed: boolean,
 *     issues: Array<{file, line, rule, message}>,
 *     backend: 'oxlint' | 'pnpm',
 *     exitCode: number,
 *     output?: string,   // only on the pnpm fallback
 *   }
 *
 * The pnpm fallback intentionally does NOT parse output — `pnpm lint` aggregates
 * heterogeneous per-package linters whose stdout shapes differ. Raw output is
 * passed through in `output` for human inspection.
 */

import { spawn } from 'node:child_process'
import { z } from 'zod'

import type { ToolDescriptor } from '../auto-discover.js'

const inputSchema = z.object({
  files: z.array(z.string()).optional(),
  fix: z.boolean().optional().default(false),
})

export type AkLintInput = z.infer<typeof inputSchema>

interface LintIssue {
  readonly file: string
  readonly line: number
  readonly rule: string
  readonly message: string
}

interface SpawnResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

interface SpawnFailure {
  readonly error: NodeJS.ErrnoException
}

type SpawnOutcome = SpawnResult | SpawnFailure

function isSpawnFailure(outcome: SpawnOutcome): outcome is SpawnFailure {
  return (outcome as SpawnFailure).error !== undefined
}

function runCommand(cmd: string, args: readonly string[]): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    const child = spawn(cmd, [...args])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err: NodeJS.ErrnoException) => {
      resolve({ error: err })
    })
    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
  })
}

interface OxlintMessage {
  readonly line?: number
  readonly ruleId?: string | null
  readonly message?: string
}

interface OxlintFileReport {
  readonly filePath?: string
  readonly messages?: readonly OxlintMessage[]
}

/**
 * Parse oxlint's `--format=json` output into our flattened issue list.
 *
 * oxlint emits an ESLint-compatible array: `[{filePath, messages: [...]}, ...]`.
 * If parsing fails (bad JSON, unexpected shape) we return an empty list rather
 * than throwing — the surrounding `passed` flag still reflects the exit code so
 * callers learn the lint failed even when the structured output is opaque.
 */
function parseOxlintIssues(stdout: string): LintIssue[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const issues: LintIssue[] = []
  for (const fileReport of parsed as OxlintFileReport[]) {
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
  return issues
}

const tool: ToolDescriptor = {
  name: 'ak_lint',
  description:
    'Run lint via `oxlint` (fast, structured JSON output) with `pnpm lint` as a fallback when oxlint is not on PATH. Returns `{passed, issues: [{file, line, rule, message}]}`.',
  inputSchema,
  handler: async (raw): Promise<{ content: { type: string; text: string }[] }> => {
    const input = inputSchema.parse(raw ?? {})

    const oxlintArgs: string[] = ['--format=json']
    if (input.fix) oxlintArgs.push('--fix')
    if (input.files && input.files.length > 0) {
      oxlintArgs.push(...input.files)
    } else {
      oxlintArgs.push('.')
    }

    const oxlintOutcome = await runCommand('oxlint', oxlintArgs)

    if (!isSpawnFailure(oxlintOutcome)) {
      const issues = parseOxlintIssues(oxlintOutcome.stdout)
      const payload = {
        passed: oxlintOutcome.exitCode === 0,
        issues,
        backend: 'oxlint' as const,
        exitCode: oxlintOutcome.exitCode,
      }
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
    }

    // ENOENT (or any spawn-time failure) → fall back to pnpm lint.
    const pnpmOutcome = await runCommand('pnpm', ['lint'])
    if (isSpawnFailure(pnpmOutcome)) {
      const payload = {
        passed: false,
        issues: [] as LintIssue[],
        backend: 'pnpm' as const,
        exitCode: 1,
        output: `oxlint missing and pnpm spawn failed: ${pnpmOutcome.error.message}`,
      }
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
    }

    const payload = {
      passed: pnpmOutcome.exitCode === 0,
      issues: [] as LintIssue[],
      backend: 'pnpm' as const,
      exitCode: pnpmOutcome.exitCode,
      output: [pnpmOutcome.stdout, pnpmOutcome.stderr].filter(Boolean).join(''),
    }
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
  },
}

export default tool
