import { describe, expect, it } from 'vitest'

import {
  parseWithFlag,
  resolveTier3Selection,
  TIER3_SKILLS,
  validateTier3Names,
} from './prompts.js'

describe('parseWithFlag', () => {
  it('splits comma-separated lists and trims whitespace', () => {
    expect(parseWithFlag(' a , b ,c')).toEqual(['a', 'b', 'c'])
  })

  it('returns empty array for undefined', () => {
    expect(parseWithFlag(undefined)).toEqual([])
  })
})

describe('validateTier3Names', () => {
  it('splits valid from invalid', () => {
    const { valid, invalid } = validateTier3Names(['tanstack-query', 'nonsense'])
    expect(valid).toEqual(['tanstack-query'])
    expect(invalid).toEqual(['nonsense'])
  })
})

describe('resolveTier3Selection', () => {
  it('returns all Tier-3 skills when --all', async () => {
    const r = await resolveTier3Selection({ allFlag: true })
    expect(r.source).toBe('all')
    expect(r.selected.toSorted()).toEqual([...TIER3_SKILLS].toSorted())
  })

  it('returns the --with subset when --with is set', async () => {
    const r = await resolveTier3Selection({ withFlag: 'tanstack-query' })
    expect(r.source).toBe('with')
    expect(r.selected).toEqual(['tanstack-query'])
  })

  it('throws on unknown --with names', async () => {
    await expect(resolveTier3Selection({ withFlag: 'does-not-exist' })).rejects.toThrow(
      /Unknown Tier-3 skills/,
    )
  })

  it('reuses existing config when no flags', async () => {
    const r = await resolveTier3Selection({
      existing: ['tanstack-query'],
      isTTY: false,
      yesFlag: true,
    })
    expect(r.source).toBe('existing')
    expect(r.selected).toEqual(['tanstack-query'])
  })

  it('defaults to base-kit with --yes and no existing config', async () => {
    const r = await resolveTier3Selection({ yesFlag: true, isTTY: true })
    expect(r.source).toBe('default')
    expect(r.selected).toEqual(['base-kit'])
  })

  it('defaults to base-kit when stdin is not a TTY', async () => {
    const r = await resolveTier3Selection({ isTTY: false })
    expect(r.source).toBe('default')
    expect(r.selected).toEqual(['base-kit'])
  })
})
