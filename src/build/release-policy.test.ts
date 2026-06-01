import { describe, expect, it } from 'vitest'

import { PUBLISH_RUNTIME_MATRIX_ENV, shouldPublishRuntimeMatrix } from './release-policy.js'

describe('shouldPublishRuntimeMatrix', () => {
  it('defaults to false when the opt-in env is absent', () => {
    expect(shouldPublishRuntimeMatrix({})).toBe(false)
  })

  it('is true only when the opt-in env is exactly "1"', () => {
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '1' })).toBe(true)
  })

  it('is false for any non-"1" value', () => {
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '0' })).toBe(false)
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: 'true' })).toBe(false)
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '' })).toBe(false)
  })
})
