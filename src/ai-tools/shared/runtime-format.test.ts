import { describe, expect, it } from 'vitest'

import { formatBytes, getErrorMessage } from './runtime-format.js'

describe('runtime-format helpers', () => {
  it('extracts useful error messages from unknown values', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
    expect(getErrorMessage('nope')).toBe('nope')
    expect(getErrorMessage({ code: 7 })).toBe('[object Object]')
  })

  it('formats byte sizes for file listings', () => {
    expect(formatBytes(12)).toBe('12 B')
    expect(formatBytes(1536)).toBe('1.5 KiB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MiB')
  })
})
