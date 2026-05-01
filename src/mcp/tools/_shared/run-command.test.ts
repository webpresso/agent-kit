import { afterEach, describe, expect, it, vi } from 'vitest'

import { isMissingBinary, isRunFailure, runCommand } from './run-command.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

interface FakeChildOpts {
  stdout?: string
  stderr?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  error?: NodeJS.ErrnoException
  // If true, never fire the close event — simulates a hung child.
  hang?: boolean
  // Capture kill signal for assertions.
  killCapture?: { signal: NodeJS.Signals | null }
}

function fakeChild(opts: FakeChildOpts = {}): unknown {
  let closeFn: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null
  return {
    stdout: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stdout) fn(Buffer.from(opts.stdout))
      },
    },
    stderr: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stderr) fn(Buffer.from(opts.stderr))
      },
    },
    on: (event: string, fn: (...args: unknown[]) => void) => {
      if (event === 'error' && opts.error) {
        queueMicrotask(() => fn(opts.error))
        return
      }
      if (event === 'close') {
        closeFn = fn as typeof closeFn
        if (!opts.error && !opts.hang) {
          // Pass exitCode through verbatim so tests can simulate `null` from
          // a signal-kill (Node's documented shape).
          const code = opts.exitCode === undefined ? 0 : opts.exitCode
          queueMicrotask(() => fn(code, opts.signal ?? null))
        }
      }
    },
    kill: (signal: NodeJS.Signals) => {
      if (opts.killCapture) opts.killCapture.signal = signal
      // Honour the kill: fire close with null code + the signal, mimicking
      // node's actual behaviour after a successful kill.
      if (closeFn) queueMicrotask(() => closeFn?.(null, signal))
    },
  }
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('runCommand', () => {
  it('returns stdout/stderr/exitCode for a successful run', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: 'hello', exitCode: 0 }))
    const outcome = await runCommand('echo', ['hi'], { timeoutMs: 1000 })
    expect(isRunFailure(outcome)).toBe(false)
    if (!isRunFailure(outcome)) {
      expect(outcome.stdout).toBe('hello')
      expect(outcome.exitCode).toBe(0)
      expect(outcome.timedOut).toBe(false)
      expect(outcome.aborted).toBe(false)
    }
  })

  it('isMissingBinary recognises ENOENT', async () => {
    const enoent = new Error('spawn ENOENT') as NodeJS.ErrnoException
    enoent.code = 'ENOENT'
    spawnMock.mockReturnValue(fakeChild({ error: enoent }))
    const outcome = await runCommand('does-not-exist', [], { timeoutMs: 1000 })
    expect(isRunFailure(outcome)).toBe(true)
    if (isRunFailure(outcome)) {
      expect(isMissingBinary(outcome)).toBe(true)
    }
  })

  // Regression: previously a SIGTERM kill returned `code ?? 0`, coercing
  // null → 0 → "passed". A timed-out lint reported success with empty issues.
  it('coerces null exit code via signal (kill never reports success)', async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: null, signal: 'SIGTERM' }))
    const outcome = await runCommand('hang', [], { timeoutMs: 1000 })
    expect(isRunFailure(outcome)).toBe(false)
    if (!isRunFailure(outcome)) {
      expect(outcome.exitCode).toBe(128 + 15) // 143
      expect(outcome.signal).toBe('SIGTERM')
    }
  })

  // Regression: previously runCommand had no signal threading. A client
  // cancelling its MCP request did nothing — the spawn ran to completion.
  it('aborts the spawn when the AbortSignal fires', async () => {
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
    spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }))
    const controller = new AbortController()
    const promise = runCommand('hang', [], { timeoutMs: 60_000, signal: controller.signal })
    controller.abort()
    const outcome = await promise
    expect(isRunFailure(outcome)).toBe(false)
    if (!isRunFailure(outcome)) {
      expect(outcome.aborted).toBe(true)
      expect(outcome.signal).toBe('SIGTERM')
    }
    expect(killCapture.signal).toBe('SIGTERM')
  })

  it('honours an already-aborted signal at call time', async () => {
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
    spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }))
    const outcome = await runCommand('hang', [], {
      timeoutMs: 60_000,
      signal: AbortSignal.abort(),
    })
    expect(isRunFailure(outcome)).toBe(false)
    if (!isRunFailure(outcome)) {
      expect(outcome.aborted).toBe(true)
    }
  })

  it('flags `timedOut` when the internal deadline fires', async () => {
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
    spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }))
    const outcome = await runCommand('hang', [], { timeoutMs: 5 })
    expect(isRunFailure(outcome)).toBe(false)
    if (!isRunFailure(outcome)) {
      expect(outcome.timedOut).toBe(true)
    }
  })
})
