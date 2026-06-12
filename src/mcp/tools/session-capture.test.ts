import { beforeEach, describe, expect, it, vi } from 'vitest'

const captureEvent = vi.fn(() => true)
const flushCapturedEvents = vi.fn(() => 1)
const resolveSessionRepoHash = vi.fn(() => 'repohash12345678')

vi.mock('#session-memory/session', () => ({
  captureEvent,
  flushCapturedEvents,
}))

vi.mock('#session-memory/repo-hash', () => ({
  resolveSessionRepoHash,
}))

describe('wp_session_capture', () => {
  beforeEach(() => {
    vi.resetModules()
    captureEvent.mockClear()
    flushCapturedEvents.mockClear()
    resolveSessionRepoHash.mockClear()
    process.env['CLAUDE_SESSION_ID'] = 'env-session'
  })

  it('captures using the active CLAUDE_SESSION_ID', async () => {
    const tool = (await import('./session-capture.js')).default
    const result = await tool.handler?.({ content: 'important note', toolName: 'manual' })

    expect(captureEvent).toHaveBeenCalledWith({
      repoHash: 'repohash12345678',
      event: {
        sessionId: undefined,
        toolName: 'manual',
        content: 'important note',
      },
    })
    expect(flushCapturedEvents).toHaveBeenCalledWith('repohash12345678')
    expect(result?.structuredContent).toMatchObject({
      captured: true,
      toolName: 'manual',
      capturedLength: 'important note'.length,
      truncated: false,
    })
  })

  it('allows an explicit sessionId override for non-Claude callers', async () => {
    const tool = (await import('./session-capture.js')).default
    await tool.handler?.({ content: 'x', sessionId: 'manual-session' })
    expect(captureEvent).toHaveBeenCalledWith({
      repoHash: 'repohash12345678',
      event: {
        sessionId: 'manual-session',
        toolName: 'manual',
        content: 'x',
      },
    })
  })

  it('does not flush buffered events when capture is disabled or rejected', async () => {
    captureEvent.mockReturnValueOnce(false)
    const tool = (await import('./session-capture.js')).default
    const result = await tool.handler?.({ content: 'will not persist' })

    expect(flushCapturedEvents).not.toHaveBeenCalled()
    expect(result?.structuredContent).toMatchObject({ captured: false })
  })
})
