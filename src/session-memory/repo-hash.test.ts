import { describe, expect, it } from 'vitest'
import { hashRepoRoot, computeRepoHash } from './repo-hash.js'

describe('hashRepoRoot', () => {
  it('returns 16 hex characters', () => {
    const h = hashRepoRoot('/some/path')
    expect(h).toHaveLength(16)
    expect(/^[0-9a-f]{16}$/.test(h)).toBe(true)
  })

  it('is deterministic', () => {
    const a = hashRepoRoot('/some/path')
    const b = hashRepoRoot('/some/path')
    expect(a).toBe(b)
  })

  it('differs for different paths', () => {
    const a = hashRepoRoot('/repo/a')
    const b = hashRepoRoot('/repo/b')
    expect(a).not.toBe(b)
  })
})

describe('computeRepoHash', () => {
  it('returns 16 hex characters for a real git repo', () => {
    const h = computeRepoHash(process.cwd())
    expect(h).toHaveLength(16)
    expect(/^[0-9a-f]{16}$/.test(h)).toBe(true)
  })

  it('falls back gracefully for a non-git directory', () => {
    const h = computeRepoHash('/tmp')
    expect(h).toHaveLength(16)
    expect(/^[0-9a-f]{16}$/.test(h)).toBe(true)
  })
})
