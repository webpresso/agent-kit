/**
 * `ak_typecheck` MCP tool.
 *
 * Runs `tsc --noEmit` either at cwd (no `packages` given) or once per
 * resolved package path (each becomes `tsc --noEmit -p <pkg>/tsconfig.json`).
 * Captures stdout (which is where `tsc` emits diagnostics) and parses
 * structured `{file, line, code, message}` entries from the standard
 * `<file>(<line>,<col>): error TS<code>: <message>` format. Returns the
 * aggregated payload `{passed, errorCount, errors, output}` wrapped in MCP
 * `text` content blocks.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { applyOutputTransform } from '#output-transforms/index'

import { resolveProjectRoot } from './_shared/project-root.js'
import { createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
import { isRunFailure, runCommand, type RunResult } from './_shared/run-command.js'

const inputSchema = z.object({
  cwd: z.string().optional(),
  packages: z.array(z.string()).optional(),
})

export type AkTypecheckInput = z.infer<typeof inputSchema>

const tscErrorSchema = z.object({
  file: z.string(),
  line: z.number(),
  code: z.string(),
  message: z.string(),
})

const outputSchema = createSummaryOutputSchema({
  counts: z.object({
    errorCount: z.number(),
  }),
  details: z.object({
    errors: z.array(tscErrorSchema),
  }),
})

export interface TscError {
  readonly file: string
  readonly line: number
  readonly code: string
  readonly message: string
}

// Hard cap: a hung tsc invocation must surface as a timeout, never as a stall.
const TYPECHECK_COMMAND_TIMEOUT_MS = 10 * 60 * 1_000

// Matches both standard tsc formats:
//   src/foo.ts(5,12): error TS2304: Cannot find name 'bar'.
//   src/foo.ts:5:12 - error TS2304: Cannot find name 'bar'.
const ERROR_LINE = /^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/

function parseTscOutput(raw: string): TscError[] {
  const errors: TscError[] = []
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const match = ERROR_LINE.exec(line)
    if (!match) continue
    const [, file, paren, colon, code, message] = match
    const lineNumber = paren ?? colon ?? '0'
    errors.push({
      file: file ?? '',
      line: Number(lineNumber),
      code: code ?? '',
      message: (message ?? '').trim(),
    })
  }
  return errors
}

/**
 * Read package globs from a `pnpm-workspace.yaml` if present at `cwd`. Used
 * only as a presence signal at the moment — the simple package-name → relative
 * dir mapping below treats the input strings as paths, which works for both
 * pnpm workspace globs (e.g. `packages/foo`) and simple subdir names. Kept as
 * its own function so future task work can expand it into proper glob
 * resolution without touching the handler.
 */
function readWorkspaceGlobs(cwd: string): string[] | null {
  const file = join(cwd, 'pnpm-workspace.yaml')
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const globs: string[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*-\s*['"]?([^'"\s#]+)['"]?\s*$/.exec(line)
    if (m && m[1]) globs.push(m[1])
  }
  return globs
}

function summarizeTypecheckResult(options: {
  passed: boolean
  errorCount: number
  timedOut: boolean
  aborted: boolean
}): string {
  if (options.timedOut) return 'typecheck timed out'
  if (options.aborted) return 'typecheck aborted'
  if (options.passed) return 'typecheck passed'
  return `typecheck failed with ${options.errorCount} error${options.errorCount === 1 ? '' : 's'}`
}

const tool: ToolDescriptor = {
  name: 'ak_typecheck',
  description:
    'Run `tsc --noEmit` per resolved package (or at cwd) and return structured diagnostics parsed from tsc stdout.',
  inputSchema,
  outputSchema,
  annotations: {
    title: 'Typecheck',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw, extra) => {
    const input = inputSchema.parse(raw ?? {})
    const cwd = resolveProjectRoot(input.cwd ? { cwd: input.cwd } : {})
    const runOptions = {
      timeoutMs: TYPECHECK_COMMAND_TIMEOUT_MS,
      signal: extra?.signal,
      cwd,
    }

    const targets: string[] | null =
      input.packages && input.packages.length > 0 ? input.packages : null

    // Touch the workspace file so its presence is observable in tests/log; the
    // current resolution treats each entry as a relative path either way.
    if (targets) readWorkspaceGlobs(cwd)

    const runs: RunResult[] = []
    if (targets) {
      for (const pkg of targets) {
        const tsconfig = join(pkg, 'tsconfig.json')
        const outcome = await runCommand('tsc', ['--noEmit', '-p', tsconfig], runOptions)
        if (isRunFailure(outcome)) {
          throw outcome.error
        }
        runs.push(outcome)
      }
    } else {
      const outcome = await runCommand('tsc', ['--noEmit'], runOptions)
      if (isRunFailure(outcome)) {
        throw outcome.error
      }
      runs.push(outcome)
    }

    const combinedStdout = runs.map((r) => r.stdout).join('')
    const combinedStderr = runs.map((r) => r.stderr).join('')
    const errors = parseTscOutput(combinedStdout)
    const passed = runs.every((r) => r.exitCode === 0)
    const timedOut = runs.some((r) => r.timedOut)
    const aborted = runs.some((r) => r.aborted)

    const { transform: _transform, ...compact } = applyOutputTransform(
      [combinedStdout, combinedStderr].filter(Boolean).join(''),
      {
        toolName: 'ak_typecheck',
      },
    )
    const payload = {
      passed,
      summary: summarizeTypecheckResult({ passed, errorCount: errors.length, timedOut, aborted }),
      counts: { errorCount: errors.length },
      details: { errors },
      ...compact,
      timedOut: timedOut || undefined,
      aborted: aborted || undefined,
    }

    return createSummaryResult(payload)
  },
}

export default tool
