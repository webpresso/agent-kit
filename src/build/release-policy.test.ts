import { describe, expect, it } from 'vitest'

import { PUBLISH_RUNTIME_MATRIX_ENV, shouldPublishRuntimeMatrix } from './release-policy.js'

describe('shouldPublishRuntimeMatrix', () => {
  it('defaults to true when the env is absent', () => {
    expect(shouldPublishRuntimeMatrix({})).toBe(true)
  })

  it('is true when the env is exactly "1"', () => {
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '1' })).toBe(true)
  })

  it('is false only for the explicit opt-out value "0"', () => {
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '0' })).toBe(false)
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: 'true' })).toBe(true)
    expect(shouldPublishRuntimeMatrix({ [PUBLISH_RUNTIME_MATRIX_ENV]: '' })).toBe(true)
  })
})
