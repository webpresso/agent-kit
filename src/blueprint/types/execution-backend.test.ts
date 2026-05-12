import { describe, expect, it } from 'vitest'
import { executionBackendSchema } from './execution-backend.js'

describe('executionBackendSchema', () => {
  it('accepts known backends', () => {
    expect(executionBackendSchema.parse('omx-team')).toStrictEqual('omx-team')
    expect(executionBackendSchema.parse('omx-pll-interactive')).toStrictEqual('omx-pll-interactive')
    expect(executionBackendSchema.parse('claude-subagent')).toStrictEqual('claude-subagent')
    expect(executionBackendSchema.parse('codex-exec')).toStrictEqual('codex-exec')
    expect(executionBackendSchema.parse('local-worktree')).toStrictEqual('local-worktree')
  })
  it('rejects unknown backends', () => {
    expect(() => executionBackendSchema.parse('unknown')).toThrow()
  })
})
