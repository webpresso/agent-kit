/**
 * `wp_typecheck` MCP tool.
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
import { globSync } from 'glob'
import { z } from 'zod'

import type { ToolDescriptor } from '#mcp/auto-discover'
import { applyOutputTransform, type TransformResult } from '#output-transforms/index'
import { getManagedRunner } from '#tool-runtime'

import { resolveProjectRoot } from './_shared/project-root.js'
import { clipRawOutput, createSummaryOutputSchema, createSummaryResult } from './_shared/result.js'
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

// A non-zero exit with zero parseable diagnostics is a runner/launcher failure
// (e.g. a missing `vp`/`tsc` binary printing a Node stack), not a type error.
// Bound that evidence well under the compact QA leaf budget and persist the full
// output to a log — otherwise a broken consumer toolchain dumps an unbounded
// blob masquerading as typecheck output (regression: ingest-lens BOOKEND).
const RUNNER_FAILURE_EVIDENCE_BUDGET = 600

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

function resolveTypecheckTarget(
  cwd: string,
  target: string,
  workspaceGlobs: string[] | null,
): string {
  const directTsconfig = join(cwd, target, 'tsconfig.json')
  if (existsSync(directTsconfig)) return target

  if (!workspaceGlobs || !target.startsWith('@')) return target

  for (const workspaceGlob of workspaceGlobs) {
    const packageJsonPattern = join(workspaceGlob, 'package.json').replaceAll('\\', '/')
    const packageJsonPaths = globSync(packageJsonPattern, {
      cwd,
      nodir: true,
      absolute: false,
    })

    for (const packageJsonPath of packageJsonPaths) {
      try {
        const packageJson = JSON.parse(readFileSync(join(cwd, packageJsonPath), 'utf8')) as {
          name?: string
        }
        if (packageJson.name === target) {
          return packageJsonPath.slice(0, -'/package.json'.length)
        }
      } catch {
        continue
      }
    }
  }

  return target
}

function summarizeTypecheckResult(options: {
  passed: boolean
  errorCount: number
  timedOut: boolean
  aborted: boolean
  failedWithoutDiagnostics: boolean
}): string {
  if (options.timedOut) return 'typecheck timed out'
  if (options.aborted) return 'typecheck aborted'
  if (options.failedWithoutDiagnostics) return 'typecheck failed to run (no diagnostics parsed)'
  if (options.passed) return 'typecheck passed'
  return `typecheck failed with ${options.errorCount} error${options.errorCount === 1 ? '' : 's'}`
}

function stripTransform(result: TransformResult): Omit<TransformResult, 'transform'> {
  const { transform: _transform, ...rest } = result
  return rest
}

/**
 * Compact, truthful evidence for a runner/launcher failure: clip to a small
 * budget and persist the full output to a log (via `clipRawOutput`) rather than
 * inlining the raw stack. Keeps the QA leaf inside its byte budget while the
 * `passed: false` + summary make the failure loud.
 */
function boundRunnerFailureEvidence(raw: string): Omit<TransformResult, 'transform'> {
  const clipped = clipRawOutput(raw, RUNNER_FAILURE_EVIDENCE_BUDGET, { toolName: 'wp_typecheck' })
  const rawBytes = Buffer.byteLength(raw)
  const bytes = Buffer.byteLength(clipped.rawOutput ?? '')
  return {
    ...clipped,
    failures: [],
    tier: 3,
    bytes,
    tokensSaved: Math.max(0, rawBytes - bytes),
  }
}

const tool: ToolDescriptor = {
  name: 'wp_typecheck',
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
    const workspaceGlobs = targets ? readWorkspaceGlobs(cwd) : null

    const runs: RunResult[] = []
    const resolution = getManagedRunner('tsc', { outputPolicy: 'structured' })
    if (targets) {
      for (const pkg of targets) {
        const resolvedTarget = resolveTypecheckTarget(cwd, pkg, workspaceGlobs)
        const tsconfig = join(resolvedTarget, 'tsconfig.json')
        const outcome = await runCommand(
          resolution.command,
          [...resolution.args, '--noEmit', '-p', tsconfig],
          runOptions,
        )
        if (isRunFailure(outcome)) {
          throw outcome.error
        }
        runs.push(outcome)
      }
    } else {
      const outcome = await runCommand(
        resolution.command,
        [...resolution.args, '--noEmit'],
        runOptions,
      )
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

    const combinedOutput = [combinedStdout, combinedStderr].filter(Boolean).join('')
    const failedWithoutDiagnostics =
      !passed && !timedOut && !aborted && errors.length === 0 && combinedOutput.trim().length > 0

    const compact = failedWithoutDiagnostics
      ? boundRunnerFailureEvidence(combinedOutput)
      : stripTransform(applyOutputTransform(combinedOutput, { toolName: 'wp_typecheck' }))

    const payload = {
      passed,
      summary: summarizeTypecheckResult({
        passed,
        errorCount: errors.length,
        timedOut,
        aborted,
        failedWithoutDiagnostics,
      }),
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
