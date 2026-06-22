import { afterEach, describe, expect, it, vi } from 'vitest'

import { PROCESS_TREE_FORCE_KILL_GRACE_MS } from '#shared-utils/process-supervisor.js'

const spawnMock = vi.hoisted(() => vi.fn())
let lastCloseFn: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(
  opts: {
    pid?: number
    hang?: boolean
    stdout?: string
    stderr?: string
    exitCode?: number | null
    signal?: NodeJS.Signals | null
    killCapture?: { signal: NodeJS.Signals | null }
  } = {},
): unknown {
  let closeFn: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null
  return {
    pid: opts.pid ?? 4321,
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
      if (closeFn) queueMicrotask(() => closeFn?.(null, signal))
    },
  }
}

afterEach(() => {
  lastCloseFn = null
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('e2e execution supervisor', () => {
  it('starts POSIX children detached and kills the process group on abort', async () => {
    if (process.platform === 'win32') return
    const { runCommandConfigs } = await import('./execution.js')
    const processKill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      queueMicrotask(() => lastCloseFn?.(null, signal as NodeJS.Signals))
      return true
    })
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
    spawnMock.mockReturnValue(fakeChild({ pid: 2468, hang: true, killCapture }))
    const controller = new AbortController()

    const promise = runCommandConfigs([{ command: 'hang', args: [] }], {
      cwd: '/repo',
      signal: controller.signal,
    })
    controller.abort()
    const result = await promise

    expect(spawnMock.mock.calls[0]![2]).toMatchObject({ detached: true })
    expect(processKill).toHaveBeenCalledWith(-2468, 'SIGTERM')
    expect(killCapture.signal).toBeNull()
    expect(result.passed).toBe(false)
  })

  it('escalates hung POSIX children from SIGTERM to SIGKILL after the grace window', async () => {
    if (process.platform === 'win32') return
    vi.useFakeTimers()
    const { runCommandConfigs } = await import('./execution.js')
    const processKill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid === -2468 && signal === 'SIGKILL') {
        queueMicrotask(() => lastCloseFn?.(null, 'SIGKILL'))
      }
      return true
    })
    spawnMock.mockReturnValue(fakeChild({ pid: 2468, hang: true }))

    const promise = runCommandConfigs([{ command: 'hang', args: [] }], {
      cwd: '/repo',
      timeoutMs: 1,
    })

    await vi.advanceTimersByTimeAsync(1)
    expect(processKill).toHaveBeenCalledWith(-2468, 'SIGTERM')

    await vi.advanceTimersByTimeAsync(PROCESS_TREE_FORCE_KILL_GRACE_MS)
    const result = await promise

    expect(processKill).toHaveBeenCalledWith(-2468, 'SIGKILL')
    expect(result.passed).toBe(false)
    expect(result.exitCode).toBe(128 + 9)
  })
})
