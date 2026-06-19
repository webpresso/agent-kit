import { afterEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
let lastCloseFn: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(opts: {
  pid?: number
  hang?: boolean
  stdout?: string
  stderr?: string
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  killCapture?: { signal: NodeJS.Signals | null }
} = {}): unknown {
  let closeFn: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null
  return {
    pid: opts.pid ?? 2468,
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
      if (event === 'close') {
        closeFn = fn as typeof closeFn
        lastCloseFn = closeFn
        if (!opts.hang) {
          queueMicrotask(() => fn(opts.exitCode ?? 0, opts.signal ?? null))
        }
      }
    },
    kill: (signal: NodeJS.Signals) => {
      if (opts.killCapture) opts.killCapture.signal = signal
      if (!opts.hang && closeFn) queueMicrotask(() => closeFn?.(null, signal))
      return true
    },
  }
}

afterEach(() => {
  lastCloseFn = null
  spawnMock.mockReset()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('secret-gate runner supervisor', () => {
  it('escalates hung POSIX children from SIGTERM to SIGKILL after the grace window', async () => {
    if (process.platform === 'win32') return
    vi.useFakeTimers()
    const { runSecretGateCommand, SECRET_GATE_FORCE_KILL_GRACE_MS } = await import('./runner.js')
    const processKill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === -2468 && signal === 'SIGKILL') {
        queueMicrotask(() => lastCloseFn?.(null, 'SIGKILL'))
      }
      return true
    })
    spawnMock.mockReturnValue(fakeChild({ pid: 2468, hang: true }))

    const promise = runSecretGateCommand({
      command: 'hang',
      timeoutMs: 1,
    })

    await vi.advanceTimersByTimeAsync(1)
    expect(processKill).toHaveBeenCalledWith(-2468, 'SIGTERM')

    await vi.advanceTimersByTimeAsync(SECRET_GATE_FORCE_KILL_GRACE_MS)
    const result = await promise

    expect(processKill).toHaveBeenCalledWith(-2468, 'SIGKILL')
    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBe(128 + 9)
  })
})
