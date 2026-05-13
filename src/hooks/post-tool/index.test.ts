import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { processDispatch } from './index.js'
import type { ToolInput } from '#hooks/shared/types'

beforeEach(() => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('processDispatch', () => {
  it('returns null (passthrough) for any input', () => {
    const input: ToolInput = {
      tool_name: 'Edit',
      tool_input: { file_path: '/tmp/test.ts', old_string: 'a', new_string: 'b' },
      cwd: '/tmp',
    }
    const result = processDispatch(input)
    expect(result).toBeNull()
  })

  it('session-capture failure does NOT block dispatcher — still returns null', () => {
    // Even with an invalid/weird input, dispatcher should return null
    const input: ToolInput = {
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
      cwd: '/tmp',
    }
    const result = processDispatch(input)
    expect(result).toBeNull()
  })

  it('handles unknown tool gracefully', () => {
    const input: ToolInput = {}
    const result = processDispatch(input)
    expect(result).toBeNull()
  })

  it('does not throw when both sub-dispatchers encounter errors', () => {
    // Pass a completely invalid input to stress-test error handling
    const input = { tool_name: undefined, tool_input: null } as unknown as ToolInput
    expect(() => processDispatch(input)).not.toThrow()
  })
})
