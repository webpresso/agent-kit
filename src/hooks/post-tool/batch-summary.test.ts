import { describe, expect, it } from 'vitest'

import { buildPostToolBatchSummary } from './batch-summary.js'

describe('buildPostToolBatchSummary', () => {
  it('summarizes success/failure counts, result sizes, and capped redacted previews', () => {
    const summary = buildPostToolBatchSummary({
      hook_event_name: 'PostToolBatch',
      tool_name: 'PostToolBatch',
      tool_input: {
        tool_calls: [
          { tool_name: 'Read', response: { content: 'hello '.repeat(200) } },
          { tool_name: 'Bash', error: 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789 failed' },
        ],
      },
    })

    expect(summary.toolNames).toEqual(['Read', 'Bash'])
    expect(summary.successCount).toBe(1)
    expect(summary.failureCount).toBe(1)
    expect(summary.totalResultBytes).toBeGreaterThan(1000)
    expect(summary.truncated).toBe(true)
    expect(summary.preview).toContain('Read:')
    expect(summary.preview).toContain('Bash:')
    expect(summary.preview).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789')
    expect(Buffer.byteLength(summary.preview, 'utf8')).toBeLessThanOrEqual(768)
  })
})
