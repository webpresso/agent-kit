import { describe, expect, it } from 'vitest'

import { shortId } from './short-id.js'

describe('shortId', () => {
  it('returns an 8-character filesystem-safe id by default', () => {
    expect(shortId()).toMatch(/^[0-9a-f]{8}$/u)
  })

  it('returns exactly the requested number of filesystem-safe characters', () => {
    expect(shortId(3)).toMatch(/^[0-9a-f]{3}$/u)
    expect(shortId(12)).toMatch(/^[0-9a-f]{12}$/u)
  })

  it('returns different values across consecutive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => shortId()))

    expect(ids.size).toBeGreaterThan(1)
  })

  it('rejects non-positive or fractional lengths', () => {
    expect(() => shortId(0)).toThrow(RangeError)
    expect(() => shortId(1.5)).toThrow(RangeError)
  })
})
