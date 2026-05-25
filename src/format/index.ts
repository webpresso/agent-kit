/**
 * Stable subpath export: `webpresso/format`.
 *
 * Wraps the `oxfmt` binary for repo formatting. Mirrors the `runLint` API
 * shape so consumers can compose lint + format in the same pipeline. Unlike
 * `runLint` there is NO fallback — `oxfmt` must be on PATH; if missing we
 * surface a clear error naming the missing binary and the install command.
 */

import { isMissingBinary, isRunFailure, runCommand } from '#mcp/tools/_shared/run-command'
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root'

export interface FormatResult {
  readonly passed: boolean
  readonly exitCode: number
  readonly output: string
  readonly fixedFiles?: readonly string[]
  readonly spawnError?: string
  readonly timedOut?: boolean
  readonly aborted?: boolean
}

export interface RunFormatOptions {
  /** Files or glob targets. When omitted, oxfmt's default discovery runs. */
  readonly files?: readonly string[]
  /** When true, only check (exit 1 on unformatted). When false/undefined, write fixes. */
  readonly check?: boolean
  /** Override the resolved project root. */
  readonly cwd?: string
  /** Hard cap on the spawned process. Defaults to 5 minutes. */
  readonly timeoutMs?: number
  /** Optional cancellation signal propagated to the child process. */
  readonly signal?: AbortSignal
}

const DEFAULT_FORMAT_TIMEOUT_MS = 5 * 60 * 1_000

/**
 * Run formatter and return a structured result. Throws a clear error when
 * `oxfmt` is not on PATH (no silent fallback).
 */
export async function runFormat(options: RunFormatOptions = {}): Promise<FormatResult> {
  const cwd = resolveProjectRoot(options.cwd ? { explicitCwd: options.cwd } : {})
  const runOptions = {
    timeoutMs: options.timeoutMs ?? DEFAULT_FORMAT_TIMEOUT_MS,
    signal: options.signal,
    cwd,
  }

  const args: string[] = []
  if (options.check) args.push('--check')
  else args.push('--write')
  // Explicit --ignore-path so oxfmt does not auto-pick `.prettierignore`.
  // Repos often ship `.prettierignore` with `*` to disable IDE Prettier
  // extensions (which would fight oxfmt). Without this flag oxfmt sees the
  // catchall and skips everything. Honor only `.gitignore` plus the patterns
  // declared in `.oxfmtrc.json#ignorePatterns`.
  args.push('--ignore-path', '.gitignore')
  if (options.files && options.files.length > 0) args.push(...options.files)

  const outcome = await runCommand('oxfmt', args, runOptions)

  if (isRunFailure(outcome)) {
    if (isMissingBinary(outcome)) {
      throw new Error(
        "oxfmt binary not found on PATH. Install it as a devDependency: 'vp install -D oxfmt'",
      )
    }
    return {
      passed: false,
      exitCode: 1,
      output: '',
      spawnError: `oxfmt spawn failed: ${outcome.error.code ?? 'unknown'} ${outcome.error.message}`,
    }
  }

  const output = [outcome.stdout, outcome.stderr].filter(Boolean).join('')
  return {
    passed: outcome.exitCode === 0,
    exitCode: outcome.exitCode,
    output,
    fixedFiles: options.check ? undefined : parseFixedFiles(outcome.stdout),
    timedOut: outcome.timedOut || undefined,
    aborted: outcome.aborted || undefined,
  }
}

/**
 * Best-effort extraction of files oxfmt rewrote. oxfmt does not currently emit
 * a structured list, so this returns an empty array unless a future version
 * adds machine-readable output. Kept as an opt-in field so downstream callers
 * can opt into richer reporting later without an API break.
 */
function parseFixedFiles(_stdout: string): readonly string[] {
  return []
}
