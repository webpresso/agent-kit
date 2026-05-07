import { describe, expect, it } from 'vitest'

import { shouldCompact } from './should-compact.js'

describe('shouldCompact', () => {
  it('defaults off for TTY and on for non-TTY', () => {
    expect(shouldCompact({ isTTY: true, env: {} })).toBe(false)
    expect(shouldCompact({ isTTY: false, env: {} })).toBe(true)
  })

  it('lets AK_COMPACT override the TTY default', () => {
    expect(shouldCompact({ isTTY: true, env: { AK_COMPACT: '1' } })).toBe(true)
    expect(shouldCompact({ isTTY: false, env: { AK_COMPACT: '0' } })).toBe(false)
  })

  it('uses QUALITY_ENGINE_COMPACT as the preferred escape hatch', () => {
    expect(shouldCompact({ isTTY: true, env: { QUALITY_ENGINE_COMPACT: '1' } })).toBe(true)
    expect(shouldCompact({ isTTY: false, env: { QUALITY_ENGINE_COMPACT: '0' } })).toBe(false)
  })

  it('accepts common false env spellings', () => {
    for (const value of ['false', 'no', 'off']) {
      expect(shouldCompact({ isTTY: false, env: { AK_COMPACT: value } })).toBe(false)
      expect(shouldCompact({ isTTY: false, env: { QUALITY_ENGINE_COMPACT: value } })).toBe(false)
    }
  })

  it('covers TTY x env quadrants', () => {
    const envValueOn = { QUALITY_ENGINE_COMPACT: '1' }
    const envValueOff = { QUALITY_ENGINE_COMPACT: '0' }

    expect(shouldCompact({ isTTY: true, env: {} })).toBe(false)
    expect(shouldCompact({ isTTY: false, env: {} })).toBe(true)

    expect(shouldCompact({ isTTY: true, env: envValueOff })).toBe(false)
    expect(shouldCompact({ isTTY: false, env: envValueOff })).toBe(false)

    expect(shouldCompact({ isTTY: true, env: envValueOn })).toBe(true)
    expect(shouldCompact({ isTTY: false, env: envValueOn })).toBe(true)
  })

  it('lets explicit flags override env and TTY', () => {
    expect(shouldCompact({ flag: true, isTTY: true, env: { AK_COMPACT: '0' } })).toBe(true)
    expect(shouldCompact({ flag: false, isTTY: false, env: { AK_COMPACT: '1' } })).toBe(false)
    expect(shouldCompact({ flag: true, isTTY: true, env: { QUALITY_ENGINE_COMPACT: '0' } })).toBe(
      true,
    )
    expect(shouldCompact({ flag: false, isTTY: false, env: { QUALITY_ENGINE_COMPACT: '1' } })).toBe(
      false,
    )
  })
})
