/**
 * Tests for tech-debt-db-parser
 *
 * Covers: field extraction, linked_blueprints, schema-computed fields,
 * fault tolerance, and contentHash.
 */

import { describe, it, expect, vi } from 'vitest'

import { parseTechDebtForDb } from './tech-debt-db-parser'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_SLUG = 'h-001-test-debt'
const FIXTURE_PATH = `/tmp/tech-debt/${FIXTURE_SLUG}.md`

const FIXTURE_CONTENT = `---
type: tech-debt
status: needs-remediation
severity: high
category: testing
review_cadence: biweekly
last_reviewed: '2026-04-01'
created: '2026-02-10'
linked_blueprints:
  - blueprint-structured-store
  - elegance-pass-2026
auto_filed_hash: abc123def456
---

# High-severity testing debt

This module has insufficient test coverage after the parser refactor.

## Context

The extraction pipeline was rewritten in March 2026 without corresponding test updates.

## Remediation plan

- Write integration tests covering the new parser paths
- Target 85% mutation score
`

const MINIMAL_CONTENT = `---
type: tech-debt
status: accepted
severity: low
category: complexity
review_cadence: monthly
last_reviewed: '2026-03-01'
---

# Low priority debt
`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseTechDebtForDb', () => {
  describe('basic field extraction', () => {
    it('extracts slug and filePath', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.slug).toBe(FIXTURE_SLUG)
      expect(result.filePath).toBe(FIXTURE_PATH)
    })

    it('extracts status, severity, category, reviewCadence', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.status).toBe('needs-remediation')
      expect(result.severity).toBe('high')
      expect(result.category).toBe('testing')
      expect(result.reviewCadence).toBe('biweekly')
    })

    it('extracts date fields', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.lastReviewed).toBe('2026-04-01')
      expect(result.created).toBe('2026-02-10')
    })

    it('extracts auto_filed_hash', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.autoFiledHash).toBe('abc123def456')
    })

    it('defaults autoFiledHash to null when absent', () => {
      const result = parseTechDebtForDb(MINIMAL_CONTENT, FIXTURE_PATH, 'minimal')
      expect(result.autoFiledHash).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Schema-computed fields
  // ---------------------------------------------------------------------------

  describe('schema-computed fields', () => {
    it('computes nextReview from last_reviewed + review_cadence', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      // biweekly = 14 days from 2026-04-01 → 2026-04-15
      expect(result.nextReview).toBe('2026-04-15')
    })

    it('computes basePriority from severity', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      // high → 30
      expect(result.basePriority).toBe(30)
    })

    it('computes basePriority 10 for low severity', () => {
      const result = parseTechDebtForDb(MINIMAL_CONTENT, FIXTURE_PATH, 'minimal')
      expect(result.basePriority).toBe(10)
    })
  })

  // ---------------------------------------------------------------------------
  // linked_blueprints
  // ---------------------------------------------------------------------------

  describe('linked_blueprints extraction', () => {
    it('extracts linked_blueprints array', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.linkedBlueprints).toStrictEqual([
        'blueprint-structured-store',
        'elegance-pass-2026',
      ])
    })

    it('defaults linkedBlueprints to empty array when absent', () => {
      const result = parseTechDebtForDb(MINIMAL_CONTENT, FIXTURE_PATH, 'minimal')
      expect(result.linkedBlueprints).toStrictEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // byteSize and contentHash
  // ---------------------------------------------------------------------------

  describe('content metrics', () => {
    it('computes byteSize', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.byteSize).toBeGreaterThan(0)
    })

    it('produces a sha256 hex contentHash', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('produces consistent contentHash for same input', () => {
      const r1 = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const r2 = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(r1.contentHash).toBe(r2.contentHash)
    })

    it('produces different contentHash for different content', () => {
      const r1 = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const r2 = parseTechDebtForDb(FIXTURE_CONTENT + '\n', FIXTURE_PATH, FIXTURE_SLUG)
      expect(r1.contentHash).not.toBe(r2.contentHash)
    })
  })

  // ---------------------------------------------------------------------------
  // Visibility
  // ---------------------------------------------------------------------------

  describe('visibility detection', () => {
    it('defaults to private', () => {
      const result = parseTechDebtForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.visibility).toBe('private')
    })
  })

  // ---------------------------------------------------------------------------
  // Fault tolerance
  // ---------------------------------------------------------------------------

  describe('fault tolerance', () => {
    it('does not throw on malformed YAML — returns partial data', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const malformed = `---
type: tech-debt
status: [broken yaml
---

# Broken
`
      expect(() => parseTechDebtForDb(malformed, FIXTURE_PATH, 'broken')).not.toThrow()
      const result = parseTechDebtForDb(malformed, FIXTURE_PATH, 'broken')
      expect(result.slug).toBe('broken')
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)

      stderrSpy.mockRestore()
    })

    it('logs to stderr on schema validation failure', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      // critical severity with non-weekly cadence violates the schema refinement
      const invalid = `---
type: tech-debt
status: needs-remediation
severity: critical
category: security
review_cadence: monthly
last_reviewed: '2026-01-01'
---

# Invalid cadence for critical
`
      parseTechDebtForDb(invalid, FIXTURE_PATH, 'invalid-cadence')

      const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]))
      expect(stderrCalls.some((msg) => msg.includes('tech-debt-db-parser'))).toBe(true)

      stderrSpy.mockRestore()
    })

    it('still returns slug and contentHash even when schema validation fails', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const invalid = `---
type: tech-debt
status: needs-remediation
severity: critical
category: security
review_cadence: monthly
last_reviewed: '2026-01-01'
---
`
      const result = parseTechDebtForDb(invalid, FIXTURE_PATH, 'invalid-cadence')
      expect(result.slug).toBe('invalid-cadence')
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
      // Falls back to raw field values
      expect(result.severity).toBe('critical')
      expect(result.status).toBe('needs-remediation')

      stderrSpy.mockRestore()
    })
  })
})
