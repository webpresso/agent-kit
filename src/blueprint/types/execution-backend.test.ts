import { describe, expect, it } from 'vitest'
import { executionBackendSchema } from './execution-backend.js'

describe('executionBackendSchema', () => {
  it('accepts known backends', () => {
    expect(executionBackendSchema.parse('omx-team')).toStrictEqual('omx-team')
    expect(executionBackendSchema.parse('omx-pll-interactive')).toStrictEqual('omx-pll-interactive')
  })
  it('rejects unknown backends', () => {
    expect(() => executionBackendSchema.parse('unknown')).toThrow()
  })
})
