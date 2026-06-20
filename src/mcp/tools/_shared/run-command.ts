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
import { join } from 'node:path'

import { terminateProcessTreeWithEscalation } from '#cli/process-tree.js'

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

// Mirrors package script execution: project-local binaries (oxfmt, oxlint,
// tsc) are devDependencies resolved via node_modules/.bin, not global installs.
const PATH_SEP = process.platform === 'win32' ? ';' : ':'

function buildEnv(cwd: string): NodeJS.ProcessEnv {
  const localBin = join(cwd, 'node_modules', '.bin')
  return {
    ...process.env,
    PATH: [localBin, process.env.PATH].filter(Boolean).join(PATH_SEP),
  }
}

export function runCommand(
  cmd: string,
  args: readonly string[],
  options: RunOptions,
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const child = spawn(cmd, [...args], {
      ...(options.cwd ? { cwd: options.cwd, env: buildEnv(options.cwd) } : {}),
      detached: process.platform !== 'win32',
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = false
    let cancelEscalation: (() => void) | undefined

    const internalTimer = setTimeout(() => {
      timedOut = true
      cancelEscalation?.()
      cancelEscalation = terminateProcessTreeWithEscalation(child)
    }, options.timeoutMs)

    const onAbort = (): void => {
      aborted = true
      cancelEscalation?.()
      cancelEscalation = terminateProcessTreeWithEscalation(child)
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
      cancelEscalation?.()
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
