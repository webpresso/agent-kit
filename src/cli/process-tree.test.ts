import { describe, expect, it, vi } from 'vitest'

import { signalProcessTree, terminateProcessTreeWithEscalation } from './process-tree.js'

describe('process tree termination', () => {
  it('escalates from SIGTERM to SIGKILL after the grace window', () => {
    vi.useFakeTimers()
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const child = { pid: 1234, kill: vi.fn() } as unknown as Parameters<
      typeof terminateProcessTreeWithEscalation
    >[0]

    const cancel = terminateProcessTreeWithEscalation(child, { escalationDelayMs: 25 })

    expect(kill).toHaveBeenCalledWith(-1234, 'SIGTERM')
    vi.advanceTimersByTime(24)
    expect(kill).not.toHaveBeenCalledWith(-1234, 'SIGKILL')
    vi.advanceTimersByTime(1)
    expect(kill).toHaveBeenCalledWith(-1234, 'SIGKILL')

    cancel()
    kill.mockRestore()
    vi.useRealTimers()
  })

  it('falls back to direct child kill when process-group signaling fails', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('no group')
    })
    const child = { pid: 1234, kill: vi.fn() } as unknown as Parameters<
      typeof signalProcessTree
    >[0]

    signalProcessTree(child, 'SIGTERM')

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    kill.mockRestore()
  })
})
