import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('#session-memory/session', () => ({
  captureEvent: vi.fn(() => true),
}))
vi.mock('#session-memory/repo-hash', () => ({
  computeRepoHash: vi.fn(() => 'test-hash-capture'),
}))

import tool from './session-capture.js'
import { captureEvent } from '#session-memory/session'

const mockCaptureEvent = vi.mocked(captureEvent)

afterEach(() => {
  vi.clearAllMocks()
})

describe('ak_session_capture MCP tool', () => {
  it('has correct tool name', () => {
    expect(tool.name).toBe('ak_session_capture')
  })

  it('captures content and returns true', async () => {
    const result = await tool.handler({ content: 'important decision: use SQLite FTS5' })
    const payload = JSON.parse(result.content[0]!.text!) as {
      captured: boolean
      toolName: string
      contentLength: number
    }
    expect(payload.captured).toBe(true)
    expect(payload.toolName).toBe('manual')
    expect(payload.contentLength).toBe('important decision: use SQLite FTS5'.length)
  })

  it('passes toolName to captureEvent', async () => {
    await tool.handler({ content: 'test finding', toolName: 'finding' })
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ toolName: 'finding' }),
      }),
    )
  })

  it('returns false when captureEvent fails', async () => {
    mockCaptureEvent.mockReturnValueOnce(false)
    const result = await tool.handler({ content: 'test content' })
    const payload = JSON.parse(result.content[0]!.text!) as { captured: boolean }
    expect(payload.captured).toBe(false)
  })

  it('rejects empty content', async () => {
    await expect(tool.handler({ content: '' })).rejects.toThrow()
  })

  it('caps content at 4096 chars before storing', async () => {
    const longContent = 'x'.repeat(5000)
    await tool.handler({ content: longContent })
    const call = mockCaptureEvent.mock.calls[0]![0]
    const capturedContent = (call.event as { content: string }).content
    expect(capturedContent.length).toBeLessThanOrEqual(4096)
  })
})
