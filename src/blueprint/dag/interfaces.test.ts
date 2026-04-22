import { describe, expect, it } from 'vitest'

import { realClock } from './interfaces.js'

describe('realClock', () => {
  it('returns a number close to Date.now()', () => {
    const before = Date.now()
    const result = realClock.now()
    const after = Date.now()

    expect(result).toBeGreaterThanOrEqual(before)
    expect(result).toBeLessThanOrEqual(after)
  })
})
