/**
 * Tests for TechDebt Zod schemas
 *
 * Verifies:
 * - Enum schemas accept valid values and reject invalid ones
 * - Transform functions compute correct derived fields
 * - Refinements enforce cross-field validation rules
 * - Branded types provide type safety
 */

import { describe, expect, it } from 'vitest'

import {
  categorySchema,
  reviewCadenceSchema,
  severitySchema,
  techDebtFrontmatterSchema,
  techDebtSlugSchema,
  techDebtStatusSchema,
} from './schema.js'

describe('TechDebt enum schemas', () => {
  it('validates status enum', () => {
    expect(techDebtStatusSchema.parse('accepted')).toBe('accepted')
    expect(techDebtStatusSchema.parse('needs-remediation')).toBe('needs-remediation')
    expect(techDebtStatusSchema.parse('monitoring')).toBe('monitoring')
    expect(techDebtStatusSchema.parse('resolved')).toBe('resolved')
    expect(() => techDebtStatusSchema.parse('invalid')).toThrow()
  })

  it('validates severity enum', () => {
    expect(severitySchema.parse('critical')).toBe('critical')
    expect(severitySchema.parse('high')).toBe('high')
    expect(severitySchema.parse('medium')).toBe('medium')
    expect(severitySchema.parse('low')).toBe('low')
    expect(() => severitySchema.parse('invalid')).toThrow()
  })

  it('validates category enum', () => {
    expect(categorySchema.parse('complexity')).toBe('complexity')
    expect(categorySchema.parse('testing')).toBe('testing')
    expect(categorySchema.parse('mutation')).toBe('mutation')
    expect(categorySchema.parse('duplication')).toBe('duplication')
    expect(categorySchema.parse('dependency')).toBe('dependency')
    expect(categorySchema.parse('security')).toBe('security')
    expect(categorySchema.parse('documentation')).toBe('documentation')
    expect(() => categorySchema.parse('invalid')).toThrow()
  })

  it('validates review cadence enum', () => {
    expect(reviewCadenceSchema.parse('weekly')).toBe('weekly')
    expect(reviewCadenceSchema.parse('biweekly')).toBe('biweekly')
    expect(reviewCadenceSchema.parse('monthly')).toBe('monthly')
    expect(reviewCadenceSchema.parse('quarterly')).toBe('quarterly')
    expect(() => reviewCadenceSchema.parse('invalid')).toThrow()
  })
})

describe('TechDebt branded slug type', () => {
  it('validates non-empty strings', () => {
    expect(techDebtSlugSchema.parse('valid-slug')).toBe('valid-slug')
    expect(() => techDebtSlugSchema.parse('')).toThrow()
  })
})

describe('TechDebt frontmatter schema transforms', () => {
  it('computes nextReview from last_reviewed and review_cadence', () => {
    const result = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'accepted',
      severity: 'high',
      category: 'complexity',
      review_cadence: 'weekly',
      last_reviewed: '2026-02-01',
    })

    expect(result.nextReview).toBe('2026-02-08') // 7 days later
  })

  it('computes nextReview for biweekly cadence', () => {
    const result = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'monitoring',
      severity: 'medium',
      category: 'testing',
      review_cadence: 'biweekly',
      last_reviewed: '2026-02-01',
    })

    expect(result.nextReview).toBe('2026-02-15') // 14 days later
  })

  it('computes nextReview for monthly cadence', () => {
    const result = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'monitoring',
      severity: 'low',
      category: 'documentation',
      review_cadence: 'monthly',
      last_reviewed: '2026-02-01',
    })

    expect(result.nextReview).toBe('2026-03-03') // 30 days later
  })

  it('computes nextReview for quarterly cadence', () => {
    const result = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'accepted',
      severity: 'low',
      category: 'duplication',
      review_cadence: 'quarterly',
      last_reviewed: '2026-01-01',
    })

    expect(result.nextReview).toBe('2026-04-01') // 90 days later (Jan 1 + 90 days = March 31)
  })

  it('computes basePriority from severity', () => {
    const critical = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'needs-remediation',
      severity: 'critical',
      category: 'security',
      review_cadence: 'weekly',
      last_reviewed: '2026-02-01',
    })
    expect(critical.basePriority).toBe(40)

    const high = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'monitoring',
      severity: 'high',
      category: 'complexity',
      review_cadence: 'weekly',
      last_reviewed: '2026-02-01',
    })
    expect(high.basePriority).toBe(30)

    const medium = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'monitoring',
      severity: 'medium',
      category: 'testing',
      review_cadence: 'biweekly',
      last_reviewed: '2026-02-01',
    })
    expect(medium.basePriority).toBe(20)

    const low = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'accepted',
      severity: 'low',
      category: 'documentation',
      review_cadence: 'monthly',
      last_reviewed: '2026-02-01',
    })
    expect(low.basePriority).toBe(10)
  })
})

describe('TechDebt frontmatter schema refinements', () => {
  it('enforces weekly cadence for critical severity', () => {
    // Valid: critical + weekly
    expect(() =>
      techDebtFrontmatterSchema.parse({
        type: 'tech-debt',
        status: 'needs-remediation',
        severity: 'critical',
        category: 'security',
        review_cadence: 'weekly',
        last_reviewed: '2026-02-01',
      }),
    ).not.toThrow()

    // Invalid: critical + monthly
    expect(() =>
      techDebtFrontmatterSchema.parse({
        type: 'tech-debt',
        status: 'needs-remediation',
        severity: 'critical',
        category: 'security',
        review_cadence: 'monthly',
        last_reviewed: '2026-02-01',
      }),
    ).toThrow('Critical severity technical debt must have weekly review cadence')
  })

  it('allows non-weekly cadence for non-critical severity', () => {
    expect(() =>
      techDebtFrontmatterSchema.parse({
        type: 'tech-debt',
        status: 'monitoring',
        severity: 'high',
        category: 'complexity',
        review_cadence: 'monthly',
        last_reviewed: '2026-02-01',
      }),
    ).not.toThrow()

    expect(() =>
      techDebtFrontmatterSchema.parse({
        type: 'tech-debt',
        status: 'accepted',
        severity: 'medium',
        category: 'testing',
        review_cadence: 'quarterly',
        last_reviewed: '2026-02-01',
      }),
    ).not.toThrow()
  })
})

describe('TechDebt frontmatter schema optional fields', () => {
  it('handles optional fields', () => {
    const result = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'monitoring',
      severity: 'high',
      category: 'complexity',
      review_cadence: 'weekly',
      last_reviewed: '2026-02-01',
      created: '2026-01-15',
      linked_blueprints: ['blueprint-1', 'blueprint-2'],
      affected_modules: ['@myorg/ui', '@myorg/database'],
    })

    expect(result.created).toBe('2026-01-15')
    expect(result.linked_blueprints).toEqual(['blueprint-1', 'blueprint-2'])
    expect(result.affected_modules).toEqual(['@myorg/ui', '@myorg/database'])
  })

  it('defaults empty arrays for optional array fields', () => {
    const result = techDebtFrontmatterSchema.parse({
      type: 'tech-debt',
      status: 'monitoring',
      severity: 'medium',
      category: 'testing',
      review_cadence: 'biweekly',
      last_reviewed: '2026-02-01',
    })

    expect(result.linked_blueprints).toEqual([])
    expect(result.affected_modules).toEqual([])
  })
})
