/**
 * Stable subpath export: `@webpresso/agent-kit/typecheck`.
 *
 * Exposes a framework-friendly `runTypecheck` runner that wraps
 * `tsc --noEmit` either at cwd (no `packages` given) or once per resolved
 * package path (each becomes `tsc --noEmit -p <pkg>/tsconfig.json`). Mirrors
 * the semantics of the `wp_typecheck` MCP tool but returns a typed result
 * directly so external scaffolders can consume it without the MCP transport.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'

import { isRunFailure, runCommand, type RunResult } from '#mcp/tools/_shared/run-command'
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root'

export interface TscError {
  readonly file: string
  readonly line: number
  readonly code: string
  readonly message: string
}

export interface TypecheckResult {
  readonly passed: boolean
  readonly errorCount: number
  readonly errors: readonly TscError[]
  readonly output: string
  readonly timedOut?: boolean
  readonly aborted?: boolean
}

export interface RunTypecheckOptions {
  /**
   * Package paths (relative to cwd). When omitted, runs a single
   * `tsc --noEmit` at cwd. When provided, runs once per package against
   * `<pkg>/tsconfig.json`.
   */
  readonly packages?: readonly string[]
  /** Override the resolved project root. */
  readonly cwd?: string
  /** Hard cap on the spawned process(es). Defaults to 10 minutes. */
  readonly timeoutMs?: number
  /** Optional cancellation signal propagated to the child process(es). */
  readonly signal?: AbortSignal
}

const DEFAULT_TYPECHECK_TIMEOUT_MS = 10 * 60 * 1_000

// Matches both standard tsc formats:
//   src/foo.ts(5,12): error TS2304: Cannot find name 'bar'.
//   src/foo.ts:5:12 - error TS2304: Cannot find name 'bar'.
const ERROR_LINE = /^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/

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

/**
 * Parse `tsc --noEmit` stdout into structured `{file, line, code, message}`
 * entries. Lines that don't match the diagnostic format are ignored so
 * preamble/`tsc` chatter never ends up in the error list.
 */
export function parseTscOutput(raw: string): TscError[] {
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
 * Run typecheck and return structured diagnostics. When `packages` is
 * provided, runs `tsc --noEmit -p <pkg>/tsconfig.json` once per entry
 * sequentially and aggregates output; otherwise a single root-level
 * `tsc --noEmit`. Throws on spawn failures (e.g. tsc missing) — those
 * indicate a misconfigured environment, not a typecheck verdict.
 */
export async function runTypecheck(options: RunTypecheckOptions = {}): Promise<TypecheckResult> {
  const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {})
  const runOptions = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TYPECHECK_TIMEOUT_MS,
    signal: options.signal,
    cwd,
  }

  const targets: readonly string[] | null =
    options.packages && options.packages.length > 0 ? options.packages : null
  const workspaceGlobs = targets ? readWorkspaceGlobs(cwd) : null

  const runs: RunResult[] = []
  if (targets) {
    for (const pkg of targets) {
      const resolvedTarget = resolveTypecheckTarget(cwd, pkg, workspaceGlobs)
      const tsconfig = join(resolvedTarget, 'tsconfig.json')
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

  return {
    passed,
    errorCount: errors.length,
    errors,
    output: [combinedStdout, combinedStderr].filter(Boolean).join(''),
    timedOut: timedOut || undefined,
    aborted: aborted || undefined,
  }
}
