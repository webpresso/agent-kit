import { afterEach, describe, expect, it, vi } from 'vitest'

import { PROCESS_TREE_FORCE_KILL_GRACE_MS } from '#shared-utils/process-supervisor.js'

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
    kill: (_signal: NodeJS.Signals) => true,
  }
}

afterEach(() => {
  lastCloseFn = null
  spawnMock.mockReset()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('quality-runner supervision', () => {
  it('escalates hung POSIX children from SIGTERM to SIGKILL after the grace window', async () => {
    if (process.platform === 'win32') return
    vi.useFakeTimers()
    const { runLoggedChildCommand } = await import('./quality-runner.js')
    const processKill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === -2468 && signal === 'SIGKILL') {
        queueMicrotask(() => lastCloseFn?.(null, 'SIGKILL'))
      }
      return true
    })
    spawnMock.mockReturnValue(fakeChild({ pid: 2468, hang: true }))

    const promise = runLoggedChildCommand(
      { command: 'hang', args: [] },
      { timeoutMs: 1, write: () => {} },
    )

    await vi.advanceTimersByTimeAsync(1)
    expect(processKill).toHaveBeenCalledWith(-2468, 'SIGTERM')

    await vi.advanceTimersByTimeAsync(PROCESS_TREE_FORCE_KILL_GRACE_MS)
    const result = await promise

    expect(processKill).toHaveBeenCalledWith(-2468, 'SIGKILL')
    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBe(128 + 9)
  })
})
