import { describe, expect, it } from 'vitest'

import {
  OPT_IN_SKILLS,
  parseWithFlag,
  resolveTier3Selection,
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
    const { valid, invalid } = validateTier3Names(['tanstack-query', 'systematic-debugging', 'nonsense'])
    expect(valid).toEqual(['tanstack-query', 'systematic-debugging'])
    expect(invalid).toEqual(['nonsense'])
  })
})

describe('resolveTier3Selection', () => {
  it('returns all opt-in skills when --all', async () => {
    const r = await resolveTier3Selection({ allFlag: true })
    expect(r.source).toBe('all')
    expect(r.selected.toSorted()).toEqual([...OPT_IN_SKILLS].toSorted())
  })

  it('keeps base-kit default-on when --with is set', async () => {
    const r = await resolveTier3Selection({ withFlag: 'tanstack-query' })
    expect(r.source).toBe('with')
    expect(r.selected).toEqual(['base-kit', 'tanstack-query'])
  })

  it('allows explicit base-kit opt-out with --without', async () => {
    const r = await resolveTier3Selection({
      withFlag: 'tanstack-query',
      withoutFlag: 'base-kit',
    })
    expect(r.source).toBe('with')
    expect(r.selected).toEqual(['tanstack-query'])
  })

  it('throws on unknown --with names', async () => {
    await expect(resolveTier3Selection({ withFlag: 'does-not-exist' })).rejects.toThrow(
      /Unknown opt-in skills/,
    )
  })

  it('throws on unknown --without names', async () => {
    await expect(resolveTier3Selection({ withoutFlag: 'does-not-exist' })).rejects.toThrow(
      /Unknown opt-in skills in --without/,
    )
  })

  it('reuses existing config when no flags', async () => {
    const r = await resolveTier3Selection({
      existing: ['tanstack-query'],
      isTTY: false,
      yesFlag: true,
    })
    expect(r.source).toBe('existing')
    expect(r.selected).toEqual(['base-kit', 'tanstack-query'])
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

  it('allows shared add-ons and rendered skills to be explicitly opted in', async () => {
    const r = await resolveTier3Selection({
      withFlag: 'systematic-debugging,monorepo-navigation',
    })
    expect(r.source).toBe('with')
    expect(r.selected).toEqual(['systematic-debugging', 'monorepo-navigation', 'base-kit'])
  })
})
