import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractToolUses, extractUsage, type Usage } from './usage-extractor'

const SAMPLE_FIXTURE = readFileSync(
  resolve(import.meta.dirname, '../__fixtures__/sample-stream.jsonl'),
  'utf8',
)

describe('usage-extractor', () => {
  it('extractUsage returns usage fields plus duration from a valid stream-json result', () => {
    expect(extractUsage(SAMPLE_FIXTURE)).toStrictEqual<Usage>({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      duration_ms: 6225,
    })
  })

  it('extractToolUses returns tool names from tool_use content and de-duplicates them', () => {
    const stream = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'working' },
            { type: 'tool_use', id: 'toolu_1', name: 'wp_session_search', input: { query: 'x' } },
            { type: 'tool_use', id: 'toolu_2', name: 'wp_session_search', input: { query: 'y' } },
            { type: 'tool_use', id: 'toolu_3', name: 'wp_session_write', input: { fact: 'z' } },
          ],
        },
      }),
    ].join('\n')

    expect(extractToolUses(stream)).toStrictEqual(['wp_session_search', 'wp_session_write'])
  })

  it('gracefully ignores malformed lines and returns partial results instead of throwing', () => {
    const stream = [
      'not-json',
      JSON.stringify({
        type: 'assistant',
        message: {
          usage: {
            input_tokens: 101,
            output_tokens: 7,
            cache_creation_input_tokens: 3,
            cache_read_input_tokens: 5,
          },
          content: [{ type: 'tool_use', name: 'wp_session_search', input: { query: 'memory' } }],
        },
      }),
      '{"truncated": ',
    ].join('\n')

    expect(() => extractUsage(stream)).not.toThrow()
    expect(() => extractToolUses(stream)).not.toThrow()
    expect(extractUsage(stream)).toStrictEqual<Usage>({
      input_tokens: 101,
      output_tokens: 7,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 5,
      duration_ms: 0,
    })
    expect(extractToolUses(stream)).toStrictEqual(['wp_session_search'])
  })

  it('supports step-finish token summaries from the existing opencode fixture shape', () => {
    const stream = [
      JSON.stringify({
        type: 'step_finish',
        duration_ms: 829,
        part: {
          type: 'step-finish',
          tokens: {
            total: 41089,
            input: 41074,
            output: 2,
            reasoning: 13,
            cache: { write: 11, read: 17 },
          },
        },
      }),
    ].join('\n')

    expect(extractUsage(stream)).toStrictEqual<Usage>({
      input_tokens: 41074,
      output_tokens: 2,
      cache_creation_input_tokens: 11,
      cache_read_input_tokens: 17,
      duration_ms: 829,
    })
  })

  it('returns zero usage and no tools when the stream contains no parseable signal', () => {
    expect(extractUsage('')).toStrictEqual<Usage>({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      duration_ms: 0,
    })
    expect(extractToolUses('')).toStrictEqual([])
  })
})
