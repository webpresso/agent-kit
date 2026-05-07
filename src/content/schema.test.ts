/**
 * Tests for consumer rule + skill content frontmatter schemas
 *
 * Verifies:
 * - Discriminated union dispatches on `type`
 * - Required fields are enforced
 * - Status / scope / applies_to / slug constraints
 * - deprecation_date conditionally required iff status === 'deprecated'
 * - Legacy `paths: [...]` normalizes to `scope: 'path:...'`
 */

import { describe, expect, it } from 'vitest'

import {
  contentFrontmatterSchema,
  ruleFrontmatterSchema,
  skillFrontmatterSchema,
} from './schema.js'

const baseRule = {
  type: 'rule' as const,
  slug: 'no-relative-parent-imports',
  title: 'No relative parent imports',
  applies_to: ['agents'],
  created: '2026-05-01',
  last_reviewed: '2026-05-01',
}

const baseSkill = {
  type: 'skill' as const,
  slug: 'frontend-design',
  title: 'Frontend design',
  applies_to: ['agents', 'humans'],
  created: '2026-05-01',
  last_reviewed: '2026-05-01',
}

describe('contentFrontmatterSchema — minimal valid', () => {
  it('parses a minimal valid rule and applies defaults', () => {
    const parsed = contentFrontmatterSchema.parse(baseRule)
    expect(parsed.type).toBe('rule')
    expect(parsed.status).toBe('active')
    expect(parsed.scope).toBe('repo')
    expect(parsed.related).toEqual([])
  })

  it('parses a minimal valid skill and applies defaults', () => {
    const parsed = contentFrontmatterSchema.parse(baseSkill)
    expect(parsed.type).toBe('skill')
    expect(parsed.status).toBe('active')
    expect(parsed.scope).toBe('repo')
    expect(parsed.related).toEqual([])
  })

  it('validates ruleFrontmatterSchema directly', () => {
    expect(ruleFrontmatterSchema.parse(baseRule).type).toBe('rule')
  })

  it('validates skillFrontmatterSchema directly', () => {
    expect(skillFrontmatterSchema.parse(baseSkill).type).toBe('skill')
  })
})

describe('contentFrontmatterSchema — required fields', () => {
  it('rejects missing slug', () => {
    const { slug: _slug, ...rest } = baseRule
    expect(() => contentFrontmatterSchema.parse(rest)).toThrow()
  })

  it('rejects missing title', () => {
    const { title: _title, ...rest } = baseRule
    expect(() => contentFrontmatterSchema.parse(rest)).toThrow()
  })

  it('rejects missing applies_to', () => {
    const { applies_to: _applies, ...rest } = baseRule
    expect(() => contentFrontmatterSchema.parse(rest)).toThrow()
  })

  it('rejects missing created', () => {
    const { created: _c, ...rest } = baseRule
    expect(() => contentFrontmatterSchema.parse(rest)).toThrow()
  })

  it('rejects missing last_reviewed', () => {
    const { last_reviewed: _lr, ...rest } = baseRule
    expect(() => contentFrontmatterSchema.parse(rest)).toThrow()
  })
})

describe('contentFrontmatterSchema — value constraints', () => {
  it('rejects invalid status', () => {
    expect(() => contentFrontmatterSchema.parse({ ...baseRule, status: 'archived' })).toThrow()
  })

  it('rejects invalid type', () => {
    expect(() => contentFrontmatterSchema.parse({ ...baseRule, type: 'guide' })).toThrow(/type/i)
  })

  it('rejects empty applies_to', () => {
    expect(() => contentFrontmatterSchema.parse({ ...baseRule, applies_to: [] })).toThrow()
  })

  it('accepts kebab-case slug', () => {
    expect(contentFrontmatterSchema.parse({ ...baseRule, slug: 'foo-bar-baz' }).slug).toBe(
      'foo-bar-baz',
    )
  })

  it('rejects slug with spaces', () => {
    expect(() => contentFrontmatterSchema.parse({ ...baseRule, slug: 'foo bar' })).toThrow()
  })

  it('rejects slug with uppercase', () => {
    expect(() => contentFrontmatterSchema.parse({ ...baseRule, slug: 'FooBar' })).toThrow()
  })

  it('accepts scope variants: repo, package:<name>, path:<glob>', () => {
    expect(contentFrontmatterSchema.parse({ ...baseRule, scope: 'package:agent-kit' }).scope).toBe(
      'package:agent-kit',
    )
    expect(contentFrontmatterSchema.parse({ ...baseRule, scope: 'path:**/*.ts' }).scope).toBe(
      'path:**/*.ts',
    )
  })

  it('rejects malformed scope', () => {
    expect(() => contentFrontmatterSchema.parse({ ...baseRule, scope: 'global' })).toThrow()
  })

  it('rejects malformed ISO date', () => {
    expect(() => contentFrontmatterSchema.parse({ ...baseRule, created: '05/01/2026' })).toThrow()
  })
})

describe('contentFrontmatterSchema — deprecation_date interlock', () => {
  it('rejects deprecation_date present when status is active', () => {
    expect(() =>
      contentFrontmatterSchema.parse({
        ...baseRule,
        status: 'active',
        deprecation_date: '2026-06-01',
      }),
    ).toThrow(/deprecation_date/)
  })

  it('rejects deprecated status without deprecation_date', () => {
    expect(() =>
      contentFrontmatterSchema.parse({
        ...baseRule,
        status: 'deprecated',
      }),
    ).toThrow(/deprecation_date/)
  })

  it('accepts deprecated status with deprecation_date', () => {
    const parsed = contentFrontmatterSchema.parse({
      ...baseRule,
      status: 'deprecated',
      deprecation_date: '2026-06-01',
    })
    expect(parsed.status).toBe('deprecated')
    expect(parsed.deprecation_date).toBe('2026-06-01')
  })
})

describe('contentFrontmatterSchema — legacy paths normalization', () => {
  it('normalizes single-element paths to scope: path:<glob>', () => {
    const parsed = contentFrontmatterSchema.parse({
      ...baseRule,
      paths: ['**/*.ts'],
    })
    expect(parsed.scope).toBe('path:**/*.ts')
  })

  it('normalizes multi-element paths by joining with comma', () => {
    const parsed = contentFrontmatterSchema.parse({
      ...baseRule,
      paths: ['**/*.ts', '**/*.tsx'],
    })
    expect(parsed.scope).toBe('path:**/*.ts,**/*.tsx')
  })

  it('prefers explicit scope over legacy paths when both present', () => {
    const parsed = contentFrontmatterSchema.parse({
      ...baseRule,
      scope: 'package:agent-kit',
      paths: ['**/*.ts'],
    })
    expect(parsed.scope).toBe('package:agent-kit')
  })
})

describe('contentFrontmatterSchema — related defaults', () => {
  it('defaults related to []', () => {
    expect(contentFrontmatterSchema.parse(baseRule).related).toEqual([])
  })

  it('accepts a list of slugs', () => {
    const parsed = contentFrontmatterSchema.parse({
      ...baseRule,
      related: ['other-rule', 'another-rule'],
    })
    expect(parsed.related).toEqual(['other-rule', 'another-rule'])
  })
})
