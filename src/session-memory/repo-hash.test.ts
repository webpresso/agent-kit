import { describe, expect, it } from 'vitest'

import { computeRepoHash } from './repo-hash.js'

describe('computeRepoHash', () => {
  it('is deterministic and short', () => {
    expect(computeRepoHash(process.cwd())).toBe(computeRepoHash(process.cwd()))
    expect(computeRepoHash(process.cwd())).toMatch(/^[a-f0-9]{16}$/u)
  })
})
