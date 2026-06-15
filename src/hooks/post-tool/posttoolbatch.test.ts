import { describe, expect, it } from 'vitest'

import { capturePostToolBatch } from './posttoolbatch.js'

describe('capturePostToolBatch', () => {
  it('stores one bounded fail-open assistant_turn_summary continuity event', () => {
    const captured: unknown[] = []
    const deps = {
      dbPath: ':memory:',
      repoHash: () => 'repo123456789abcd',
      now: () => new Date('2026-06-15T00:00:00.000Z'),
      createStore: () => ({
        captureEvent: (input: unknown) => {
          captured.push(input)
          return 'event'
        },
        close: () => undefined,
      }),
    }

    expect(
      capturePostToolBatch(
        {
          session_id: 'session-1',
          cwd: '/repo',
          hook_event_name: 'PostToolBatch',
          tool_name: 'PostToolBatch',
          tool_input: {
            tool_calls: [
              { tool_name: 'Read', response: { content: 'safe content' } },
              { tool_name: 'WebFetch', response: { content: 'sk_test_1234567890abcdef123456' } },
            ],
          },
        },
        '/repo',
        {},
        deps,
      ),
    ).toBe(true)

    expect(captured).toHaveLength(1)
    const event = (captured[0] as { event: { eventType: string; content: string; metadata: Record<string, unknown> } }).event
    expect(event.eventType).toBe('assistant_turn_summary')
    expect(event.metadata.source).toBe('post-tool-batch-hook')
    expect(event.metadata.successCount).toBe(2)
    expect(event.content).not.toContain('sk_test_1234567890abcdef123456')
  })

  it('fails open when storage creation fails', () => {
    expect(
      capturePostToolBatch(
        { hook_event_name: 'PostToolBatch', tool_input: { tool_calls: [{ tool_name: 'Bash' }] } },
        '/repo',
        {},
        { createStore: () => { throw new Error('db down') } },
      ),
    ).toBe(false)
  })
})
