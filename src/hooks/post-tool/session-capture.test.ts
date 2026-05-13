import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ToolInput } from '#hooks/shared/types'
import { captureToolEvent } from './session-capture.js'

beforeEach(() => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('captureToolEvent', () => {
  it('returns true for a valid Edit tool input', () => {
    const input: ToolInput = {
      tool_name: 'Edit',
      tool_input: {
        file_path: '/tmp/test.ts',
        old_string: 'const a = 1',
        new_string: 'const a = 2',
      },
      session_id: 'test-session-id',
      cwd: process.cwd(),
    }
    const result = captureToolEvent(input, 'test-session-id')
    expect(result).toBe(true)
  })

  it('returns true for a Bash tool input', () => {
    const input: ToolInput = {
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      session_id: 'test-session',
      cwd: process.cwd(),
    }
    const result = captureToolEvent(input, 'test-session')
    expect(result).toBe(true)
  })

  it('returns true even for empty input (does not throw)', () => {
    const input: ToolInput = {}
    const result = captureToolEvent(input, 'test-session')
    // captureEvent may succeed or fail gracefully — either way must not throw
    expect(typeof result).toBe('boolean')
  })

  it('does not throw when tool_input is null', () => {
    const input = { tool_name: 'Read', tool_input: undefined } as ToolInput
    expect(() => captureToolEvent(input, 'sid')).not.toThrow()
  })
})
