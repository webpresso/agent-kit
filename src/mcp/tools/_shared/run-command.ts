/**
 * Single shared `runCommand` for tool spawns.
 *
 * Replaces near-duplicate implementations that lived in `lint.ts` and
 * `typecheck.ts`. Accepts:
 *
 *   - `timeoutMs` — internal deadline (per-tool default; lint=5min, typecheck=10min).
 *   - `signal`    — propagated from the MCP request's AbortSignal so a
 *                   client-issued `notifications/cancelled` aborts the spawn.
 *   - `cwd`       — explicit working directory; project-root resolution lives
 *                   in `./project-root.ts` to keep this module pure.
 *
 * Both internal-timeout and external-cancel kill paths surface as a
 * non-zero `exitCode` (signal-derived) and a `timedOut`/`aborted` flag in
 * the result, so callers never coerce a kill into success.
 */

import { spawn } from 'node:child_process'

export interface RunResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly signal: NodeJS.Signals | null
  readonly timedOut: boolean
  readonly aborted: boolean
}

export interface RunFailure {
  readonly error: NodeJS.ErrnoException
}

export type RunOutcome = RunResult | RunFailure

export interface RunOptions {
  readonly timeoutMs: number
  readonly signal?: AbortSignal
  readonly cwd?: string
}

export function isRunFailure(outcome: RunOutcome): outcome is RunFailure {
  return (outcome as RunFailure).error !== undefined
}

export function isMissingBinary(failure: RunFailure): boolean {
  return failure.error.code === 'ENOENT'
}

const COMMON_SIGNAL_NUMBERS: Readonly<Partial<Record<NodeJS.Signals, number>>> = {
  SIGINT: 2,
  SIGKILL: 9,
  SIGTERM: 15,
}

function exitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) return 1
  return 128 + (COMMON_SIGNAL_NUMBERS[signal] ?? 15)
}

export function runCommand(
  cmd: string,
  args: readonly string[],
  options: RunOptions,
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const child = spawn(cmd, [...args], options.cwd ? { cwd: options.cwd } : undefined)
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = false

    const internalTimer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, options.timeoutMs)

    const onAbort = (): void => {
      aborted = true
      child.kill('SIGTERM')
    }
    if (options.signal) {
      if (options.signal.aborted) {
        // Defer to a microtask so the child's `close` handler (registered
        // below) is in place by the time `kill` fires close. Otherwise an
        // already-aborted signal kills the child before close is wired up
        // and the promise never resolves.
        queueMicrotask(onAbort)
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
    }

    const cleanup = (): void => {
      clearTimeout(internalTimer)
      options.signal?.removeEventListener('abort', onAbort)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err: NodeJS.ErrnoException) => {
      cleanup()
      resolve({ error: err })
    })
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      const exitCode = code ?? exitCodeFromSignal(signal)
      resolve({ stdout, stderr, exitCode, signal, timedOut, aborted })
    })
  })
}
