/**
 * Tests for blueprint-db-parser
 *
 * Covers: field extraction, gstack-vocabulary tolerance, dependency extraction,
 * risk-table parsing, and a snapshot test against a real completed blueprint.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'

import { parseBlueprintForDb } from './blueprint-db-parser'

// ---------------------------------------------------------------------------
// Minimal fixture: inline _overview.md
// ---------------------------------------------------------------------------

const FIXTURE_SLUG = 'test-feature-blueprint'
const FIXTURE_PATH = `/tmp/blueprints/in-progress/${FIXTURE_SLUG}/_overview.md`

const FIXTURE_CONTENT = `---
type: blueprint
status: in-progress
complexity: M
owner: alice
created: '2026-01-15'
last_updated: '2026-03-20'
completed_at:
tags:
  - testing
  - parser
depends_on:
  - other-blueprint
cross_repo_depends_on:
  - repo: webpresso/framework
    slug: schema-engine-v2
    require_status: completed
---

# Test Feature Blueprint

A blueprint for testing the DB parser.

## Risks

| # | Risk | Mitigation | Severity |
|---|------|------------|----------|
| R1 | HIGH | Some risk description | Some mitigation |
| R2 | MEDIUM | Another risk | Another mitigation |

## Edge Cases

| # | Severity | Scenario | Handling |
|---|----------|----------|----------|
| E1 | HIGH | Edge case one | Handle gracefully |
| E2 | LOW | Edge case two | Ignore |

### Phase 1: Core parsing [Complexity: S]

#### Task 1.1: Parse frontmatter
**Status:** done
**Depends:** none
- [x] Frontmatter fields extracted
- [x] Tags parsed as array

#### Task 1.2: Parse task blocks
**Status:** in-progress
**Depends:** Task 1.1
- [x] Task headers matched
- [ ] Status lines read

#### Task 1.3: Verify QA and design review acceptance criteria
**Status:** todo
- [ ] Run /qa and ensure no warnings
- [ ] Run /design-review on the output
- [ ] Run /investigate if errors
- [ ] Run /review before merging
- [ ] Run /ship to deploy
`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseBlueprintForDb', () => {
  describe('basic field extraction', () => {
    it('extracts core frontmatter fields', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)

      expect(result.slug).toBe(FIXTURE_SLUG)
      expect(result.filePath).toBe(FIXTURE_PATH)
      expect(result.title).toBe('Test Feature Blueprint')
      expect(result.status).toBe('in-progress')
      expect(result.complexity).toBe('M')
      expect(result.owner).toBe('alice')
      expect(result.created).toBe('2026-01-15')
      expect(result.lastUpdated).toBe('2026-03-20')
      expect(result.completedAt).toBeNull()
    })

    it('extracts tags and depends_on arrays', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)

      expect(result.tags).toStrictEqual(['testing', 'parser'])
      expect(result.dependsOn).toStrictEqual(['other-blueprint'])
    })

    it('extracts cross_repo_depends_on', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)

      expect(result.crossRepoDependsOn).toStrictEqual([
        {
          repo: 'webpresso/framework',
          slug: 'schema-engine-v2',
          requireStatus: 'completed',
        },
      ])
    })

    it('computes byteSize and contentHash', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)

      expect(result.byteSize).toBeGreaterThan(0)
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('produces consistent contentHash for same content', () => {
      const r1 = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const r2 = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(r1.contentHash).toBe(r2.contentHash)
    })

    it('produces different contentHash for different content', () => {
      const r1 = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const r2 = parseBlueprintForDb(FIXTURE_CONTENT + '\nextra line', FIXTURE_PATH, FIXTURE_SLUG)
      expect(r1.contentHash).not.toBe(r2.contentHash)
    })

    it('defaults visibility to private', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.visibility).toBe('private')
    })
  })

  // ---------------------------------------------------------------------------
  // Gstack vocabulary tolerance
  // ---------------------------------------------------------------------------

  describe('gstack-vocabulary tolerance', () => {
    it('parses gstack skill names in acceptance criteria cleanly without warnings', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)

      // The task with gstack skills in acceptance criteria
      const gstackTask = result.tasks.find((t) => t.taskId === '1.3')
      expect(gstackTask).not.toBe(undefined)

      const criteria = gstackTask?.acceptanceCriteria ?? []
      expect(criteria.some((c) => c.includes('/qa'))).toBe(true)
      expect(criteria.some((c) => c.includes('/design-review'))).toBe(true)
      expect(criteria.some((c) => c.includes('/investigate'))).toBe(true)
      expect(criteria.some((c) => c.includes('/review'))).toBe(true)
      expect(criteria.some((c) => c.includes('/ship'))).toBe(true)

      // No validation warnings should have been emitted for gstack skill names
      const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0]))
      const gstackWarnings = stderrCalls.filter(
        (msg) =>
          msg.includes('/qa') ||
          msg.includes('/design-review') ||
          msg.includes('/investigate') ||
          msg.includes('/review') ||
          msg.includes('/ship'),
      )
      expect(gstackWarnings).toHaveLength(0)

      stderrSpy.mockRestore()
    })

    it('parses all acceptance criteria lines including gstack skill references', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const task = result.tasks.find((t) => t.taskId === '1.3')
      expect(task?.acceptanceCriteria).toHaveLength(5)
    })
  })

  // ---------------------------------------------------------------------------
  // Task parsing
  // ---------------------------------------------------------------------------

  describe('task parsing', () => {
    it('extracts all tasks', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.tasks).toHaveLength(3)
    })

    it('extracts task ids and titles', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const ids = result.tasks.map((t) => t.taskId)
      expect(ids).toStrictEqual(['1.1', '1.2', '1.3'])
    })

    it('reads explicit task status', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const t1 = result.tasks.find((t) => t.taskId === '1.1')
      const t2 = result.tasks.find((t) => t.taskId === '1.2')
      const t3 = result.tasks.find((t) => t.taskId === '1.3')

      expect(t1?.status).toBe('done')
      expect(t2?.status).toBe('in-progress')
      expect(t3?.status).toBe('todo')
    })

    it('derives status from checkboxes when no explicit status present', () => {
      const content = `---
type: blueprint
status: completed
complexity: S
---

# No Explicit Status Blueprint

#### Task 1.1: All done
- [x] Item 1
- [x] Item 2

#### Task 1.2: Partial
- [x] Item 1
- [ ] Item 2

#### Task 1.3: Not started
- [ ] Item 1
`
      const result = parseBlueprintForDb(content, FIXTURE_PATH, 'test')
      const t1 = result.tasks.find((t) => t.taskId === '1.1')
      const t2 = result.tasks.find((t) => t.taskId === '1.2')
      const t3 = result.tasks.find((t) => t.taskId === '1.3')

      expect(t1?.status).toBe('done')
      expect(t2?.status).toBe('in-progress')
      expect(t3?.status).toBe('todo')
    })

    it('extracts dependency task IDs from **Depends:** line', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const t2 = result.tasks.find((t) => t.taskId === '1.2')
      expect(t2?.dependsOnTaskIds).toStrictEqual(['1.1'])
    })

    it('returns empty dependsOnTaskIds when Depends is none', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const t1 = result.tasks.find((t) => t.taskId === '1.1')
      expect(t1?.dependsOnTaskIds).toStrictEqual([])
    })

    it('extracts acceptance criteria checklist lines', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const t1 = result.tasks.find((t) => t.taskId === '1.1')
      expect(t1?.acceptanceCriteria).toHaveLength(2)
      expect(t1?.acceptanceCriteria[0]).toMatch(/\[x\].*Frontmatter fields/)
    })
  })

  // ---------------------------------------------------------------------------
  // Risk table parsing
  // ---------------------------------------------------------------------------

  describe('risk table parsing', () => {
    it('parses risk rows from ## Risks table', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.risks).toHaveLength(2)
    })

    it('extracts riskId, severity, description, and mitigation', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const r1 = result.risks.find((r) => r.riskId === 'R1')
      expect(r1).toStrictEqual({
        riskId: 'R1',
        severity: 'HIGH',
        description: 'Some risk description',
        mitigation: 'Some mitigation',
      })
    })

    it('normalises severity to enum values', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const r2 = result.risks.find((r) => r.riskId === 'R2')
      expect(r2?.severity).toBe('MEDIUM')
    })

    it('returns empty risks when no ## Risks section', () => {
      const noRisks = FIXTURE_CONTENT.replace(/## Risks[\s\S]*?## Edge Cases/, '## Edge Cases')
      const result = parseBlueprintForDb(noRisks, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.risks).toStrictEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // Edge case table parsing
  // ---------------------------------------------------------------------------

  describe('edge case table parsing', () => {
    it('parses edge case rows', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      expect(result.edgeCases).toHaveLength(2)
    })

    it('extracts edgeId, severity, description, and mitigation', () => {
      const result = parseBlueprintForDb(FIXTURE_CONTENT, FIXTURE_PATH, FIXTURE_SLUG)
      const e1 = result.edgeCases.find((e) => e.edgeId === 'E1')
      expect(e1?.severity).toBe('HIGH')
      expect(e1?.description).toBe('Edge case one')
    })
  })

  // ---------------------------------------------------------------------------
  // Fault tolerance
  // ---------------------------------------------------------------------------

  describe('fault tolerance', () => {
    it('returns partial data with default slug on malformed YAML frontmatter', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

      const malformed = `---
type: blueprint
status: [broken yaml
---

# Broken Blueprint
`
      // Should not throw
      const result = parseBlueprintForDb(malformed, FIXTURE_PATH, 'broken')
      expect(result.slug).toBe('broken')
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)

      stderrSpy.mockRestore()
    })

    it('returns empty tasks/risks/edgeCases when body sections are missing', () => {
      const minimal = `---
type: blueprint
status: draft
complexity: XS
---

# Minimal Blueprint
`
      const result = parseBlueprintForDb(minimal, FIXTURE_PATH, 'minimal')
      expect(result.tasks).toStrictEqual([])
      expect(result.risks).toStrictEqual([])
      expect(result.edgeCases).toStrictEqual([])
    })

    it('uses slug as title when no # heading exists', () => {
      const noHeading = `---
type: blueprint
status: draft
complexity: XS
---

No heading here.
`
      const result = parseBlueprintForDb(noHeading, FIXTURE_PATH, 'no-heading-slug')
      expect(result.title).toBe('no-heading-slug')
    })
  })

  // ---------------------------------------------------------------------------
  // Snapshot against a real completed blueprint
  // ---------------------------------------------------------------------------

  describe('snapshot test against real blueprint', () => {
    it('parses elegance-pass-2026 without throwing and has expected shape', () => {
      const realPath = path.resolve(
        process.cwd(),
        'blueprints/completed/elegance-pass-2026/_overview.md',
      )

      let content: string
      try {
        content = readFileSync(realPath, 'utf8')
      } catch {
        // Skip if file not present in this environment
        return
      }

      const result = parseBlueprintForDb(content, realPath, 'elegance-pass-2026')

      expect(result.slug).toBe('elegance-pass-2026')
      expect(result.status).toBe('completed')
      expect(result.title.length).toBeGreaterThan(0)
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(result.byteSize).toBeGreaterThan(0)
      // Real blueprint has risks table
      expect(result.risks.length).toBeGreaterThan(0)
      // Real blueprint has edge cases
      expect(result.edgeCases.length).toBeGreaterThan(0)
    })
  })
})
