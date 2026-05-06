import { describe, expect, it, afterEach } from 'vitest'

import {
  applyOutputTransform,
  clearTransformsForTest,
  normalizeToolName,
  registerTransform,
} from './index.js'

afterEach(() => {
  clearTransformsForTest()
})

describe('output transform dispatcher', () => {
  it('uses the generic errors-only fallback with bytes when no transform is registered', () => {
    const result = applyOutputTransform('hello\nERROR one', {
      toolName: 'ak_custom',
      persistOverflow: false,
    })

    expect(result).toMatchObject({
      rawOutput: 'ERROR one',
      transform: {
        toolName: 'ak_custom',
        normalizedToolName: 'custom',
        tier: 'registered',
        rawBytes: 15,
      },
    })
  })

  it('normalizes dynamic audit tool names for lookup', () => {
    expect(normalizeToolName('ak_audit-blueprint-lifecycle')).toBe('audit')

    registerTransform('audit', (rawOutput, context) => ({
      rawOutput: `registered:${rawOutput}`,
      transform: {
        toolName: context.toolName,
        normalizedToolName: context.normalizedToolName,
        tier: 'registered',
        rawBytes: Buffer.byteLength(rawOutput ?? ''),
      },
    }))

    const result = applyOutputTransform('ok', {
      toolName: 'ak_audit-blueprint-lifecycle',
    })

    expect(result).toMatchObject({
      rawOutput: 'registered:ok',
      transform: {
        toolName: 'ak_audit-blueprint-lifecycle',
        normalizedToolName: 'audit',
        tier: 'registered',
        rawBytes: 2,
      },
    })
  })
})
