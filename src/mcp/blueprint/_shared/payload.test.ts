import { describe, expect, it } from 'vitest'

import { bytes, sortKeys, toStr } from '#mcp/blueprint/_shared/payload'

describe('blueprint payload helpers', () => {
  it('counts utf8 bytes', () => {
    expect(bytes('abc')).toBe(3)
    expect(bytes('é')).toBe(2)
  })

  it('normalizes thrown values to strings', () => {
    expect(toStr(new Error('boom'))).toBe('boom')
    expect(toStr('plain')).toBe('plain')
  })

  it('recursively sorts object keys without changing arrays', () => {
    expect(sortKeys({ b: 1, a: { d: 4, c: 3 }, list: [{ z: 1, y: 2 }] })).toEqual({
      a: { c: 3, d: 4 },
      b: 1,
      list: [{ y: 2, z: 1 }],
    })
  })
})
