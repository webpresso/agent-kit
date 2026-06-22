import { afterEach, describe, expect, it } from 'vitest'

import { _resetRandomBytesForTests, _setRandomBytesForTests, shortId } from './short-id.js'

afterEach(() => {
  _resetRandomBytesForTests()
})

describe('shortId', () => {
  it('returns an 8-character filesystem-safe id by default', () => {
    expect(shortId()).toMatch(/^[0-9a-z]{8}$/u)
  })

  it('returns exactly the requested number of filesystem-safe characters', () => {
    expect(shortId(3)).toMatch(/^[0-9a-z]{3}$/u)
    expect(shortId(12)).toMatch(/^[0-9a-z]{12}$/u)
  })

  it('returns different values across consecutive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => shortId()))
    expect(ids.size).toBeGreaterThan(1)
  })

  it('rejects non-positive or fractional lengths', () => {
    expect(() => shortId(0)).toThrow(RangeError)
    expect(() => shortId(1.5)).toThrow(RangeError)
  })

  it('emits base36 characters outside the hex range (g-z)', () => {
    // Byte 16 → ALPHABET[16 % 36] = ALPHABET[16] = 'g'. A hex encoder
    // would emit '10' for byte 16, so this assertion fails against the hex impl.
    _setRandomBytesForTests(() => Buffer.from([16]))
    expect(shortId(1)).toBe('g')
  })

  it('returns exactly N characters even when leading bytes are rejected', () => {
    // Bytes >= 252 are rejected (252 = 7×36, leaving 4 biased values).
    // Supplying a rejected byte (252) before an accepted one (0 → '0') proves
    // the loop-until-N contract: a sample-once-and-filter impl would return ''.
    _setRandomBytesForTests(() => Buffer.from([252, 0]))
    const id = shortId(1)
    expect(id).toBe('0')
    expect(id.length).toBe(1)
  })
})
