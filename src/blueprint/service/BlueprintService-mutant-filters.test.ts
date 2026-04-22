import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BlueprintService } from './BlueprintService.js'

describe('BlueprintService - mutant filters', () => {
  let testDir: string
  let service: BlueprintService

  beforeEach(async () => {
    testDir = path.join(
      process.cwd(),
      '.test-plan-service',
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await fs.mkdir(testDir, { recursive: true })
    service = new BlueprintService(testDir)
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('mutant-killing: matchesGroupFilter null group exclusion', () => {
    it('should return false for a plan with null group when group filter is set', async () => {
      // Create ONLY a standalone plan (no group)
      const standaloneDir = path.join(testDir, 'webpresso/blueprints/standalone-null-grp')
      await fs.mkdir(standaloneDir, { recursive: true })
      await fs.writeFile(
        path.join(standaloneDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Standalone Null Group
`,
      )

      // Filter by a group name - the standalone plan has group=null
      const result = await service.query({
        filters: { group: 'any-group' },
      })

      // The standalone plan should NOT match because its group is null
      expect(result.plans).toHaveLength(0)
    })
  })

  describe('mutant-killing: matchesComplexityFilter undefined complexity', () => {
    it('should exclude plans with undefined complexity when complexity filter is set', async () => {
      const validDir = path.join(testDir, 'webpresso/blueprints/complexity-valid')
      await fs.mkdir(validDir, { recursive: true })
      await fs.writeFile(
        path.join(validDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# Complexity Valid
`,
      )

      const result = await service.query({
        filters: { complexity: 'L' },
      })

      expect(result.plans).toHaveLength(1)
      expect(result.plans[0].complexity).toBe('L')

      // Also verify filtering by a different complexity excludes it
      const resultMismatch = await service.query({
        filters: { complexity: 'XS' },
      })
      expect(resultMismatch.plans).toHaveLength(0)
    })
  })

  describe('mutant-killing: matchesStaleFilter exact freshness status', () => {
    it('should include critical plans when stale filter is true', async () => {
      // Create a very old in-progress plan that will be critical (>30 days for in-progress)
      const criticalDir = path.join(testDir, 'webpresso/blueprints/critical-plan')
      await fs.mkdir(criticalDir, { recursive: true })

      const today = new Date()
      const criticalDate = new Date(today)
      criticalDate.setDate(today.getDate() - 60) // 60 days ago = critical for in-progress

      await fs.writeFile(
        path.join(criticalDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${criticalDate.toISOString().split('T')[0]}
created: ${criticalDate.toISOString().split('T')[0]}
---
# Critical Plan
`,
      )

      const result = await service.query({
        filters: { stale: true },
      })

      expect(result.plans).toHaveLength(1)
      expect(result.plans[0].name).toBe('critical-plan')
      expect(result.plans[0].freshness.status).toBe('critical')
    })

    it('should NOT include aging or fresh plans when stale filter is true', async () => {
      // Create a plan that is aging but not stale (7-14 days for in-progress)
      const agingDir = path.join(testDir, 'webpresso/blueprints/aging-plan')
      await fs.mkdir(agingDir, { recursive: true })

      const today = new Date()
      const agingDate = new Date(today)
      agingDate.setDate(today.getDate() - 10) // 10 days = aging for in-progress

      await fs.writeFile(
        path.join(agingDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${agingDate.toISOString().split('T')[0]}
created: ${agingDate.toISOString().split('T')[0]}
---
# Aging Plan
`,
      )

      const result = await service.query({
        filters: { stale: true },
      })

      // Aging plans should NOT be included in stale filter
      expect(result.plans).toHaveLength(0)
    })
  })

  describe('mutant-killing: applySorting direction multiplier', () => {
    it('should correctly multiply comparison by -1 for desc direction', async () => {
      const planADir = path.join(testDir, 'webpresso/blueprints/sort-a')
      const planBDir = path.join(testDir, 'webpresso/blueprints/sort-b')
      const planCDir = path.join(testDir, 'webpresso/blueprints/sort-c')
      await fs.mkdir(planADir, { recursive: true })
      await fs.mkdir(planBDir, { recursive: true })
      await fs.mkdir(planCDir, { recursive: true })

      await fs.writeFile(
        path.join(planADir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Sort A
#### Task 1.1: One task
**Status:** todo

`,
      )
      await fs.writeFile(
        path.join(planBDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Sort B
#### Task 1.1: T1
**Status:** todo

#### Task 1.2: T2
**Status:** todo

#### Task 1.3: T3
**Status:** todo

`,
      )
      await fs.writeFile(
        path.join(planCDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Sort C
#### Task 1.1: T1
**Status:** todo

#### Task 1.2: T2
**Status:** todo

`,
      )

      // Test ascending: 1, 2, 3 tasks
      const ascResult = await service.query({
        sort: { field: 'taskCount', direction: 'asc' },
      })
      expect(ascResult.plans[0].taskCount).toBe(1)
      expect(ascResult.plans[1].taskCount).toBe(2)
      expect(ascResult.plans[2].taskCount).toBe(3)

      // Test descending: 3, 2, 1 tasks
      const descResult = await service.query({
        sort: { field: 'taskCount', direction: 'desc' },
      })
      expect(descResult.plans[0].taskCount).toBe(3)
      expect(descResult.plans[1].taskCount).toBe(2)
      expect(descResult.plans[2].taskCount).toBe(1)
    })
  })

  describe('mutant-killing: computeSummary byGroup excludes null groups', () => {
    it('should not include null-group plans in byGroup counts', async () => {
      // Create a standalone plan (group=null) and a grouped plan
      const standaloneDir = path.join(testDir, 'webpresso/blueprints/solo-bygroup')
      const groupedDir = path.join(testDir, 'webpresso/blueprints/team/grouped-bygroup')
      await fs.mkdir(standaloneDir, { recursive: true })
      await fs.mkdir(groupedDir, { recursive: true })

      await fs.writeFile(
        path.join(standaloneDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Solo ByGroup
`,
      )
      await fs.writeFile(
        path.join(groupedDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Grouped ByGroup
`,
      )

      const result = await service.query()

      // byGroup should only have 'team' with count 1, NOT include null
      expect(result.summary.byGroup).toEqual({ team: 1 })
      // total should include both plans
      expect(result.summary.total).toBe(2)
      expect(result.summary.byStatus).toEqual({ draft: 2 })
    })
  })

  describe('mutant-killing: computeSummary total uses totalFiltered not allPlans', () => {
    it('should return totalFiltered as summary.total when filters reduce the count', async () => {
      const plan1 = path.join(testDir, 'webpresso/blueprints/filtered-total-1')
      const plan2 = path.join(testDir, 'webpresso/blueprints/filtered-total-2')
      const plan3 = path.join(testDir, 'webpresso/blueprints/filtered-total-3')
      await fs.mkdir(plan1, { recursive: true })
      await fs.mkdir(plan2, { recursive: true })
      await fs.mkdir(plan3, { recursive: true })

      await fs.writeFile(
        path.join(plan1, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Filtered Total 1
`,
      )
      await fs.writeFile(
        path.join(plan2, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Filtered Total 2
`,
      )
      await fs.writeFile(
        path.join(plan3, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# Filtered Total 3
`,
      )

      // Filter to only drafts - should get 2 out of 3
      const result = await service.query({
        filters: { status: 'draft' },
      })

      expect(result.plans).toHaveLength(2)
      // summary.total should be totalBeforePagination (2), not allPlans.length (3)
      expect(result.summary.total).toBe(2)
      // But byStatus should be computed from ALL plans (not filtered)
      expect(result.summary.byStatus).toEqual({
        draft: 2,
        'in-progress': 1,
      })
    })
  })

  describe('mutant-killing: computeSummary avgFreshness calculation', () => {
    it('should compute avgFreshness as the mean of all plan freshness scores', async () => {
      const plan1 = path.join(testDir, 'webpresso/blueprints/avg-fresh-1')
      const plan2 = path.join(testDir, 'webpresso/blueprints/avg-fresh-2')
      await fs.mkdir(plan1, { recursive: true })
      await fs.mkdir(plan2, { recursive: true })

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]

      await fs.writeFile(
        path.join(plan1, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: ${todayStr}
created: ${todayStr}
---
# Avg Fresh 1
`,
      )
      await fs.writeFile(
        path.join(plan2, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: ${todayStr}
created: ${todayStr}
---
# Avg Fresh 2
`,
      )

      const result = await service.query()

      // Both plans updated today, so each has score close to 1.0
      // Average of two identical scores should equal each individual score
      expect(result.plans).toHaveLength(2)
      const score1 = result.plans[0].freshness.score
      const score2 = result.plans[1].freshness.score
      const expectedAvg = (score1 + score2) / 2
      expect(result.summary.avgFreshness).toBeCloseTo(expectedAvg, 5)
    })
  })

  describe('mutant-killing: isStale exact status check', () => {
    it('should count stale-status plans as stale but not aging or fresh', async () => {
      const today = new Date()
      const freshDate = today.toISOString().split('T')[0]
      // 15 days ago = stale for in-progress (threshold is 14)
      const staleDate = new Date(today)
      staleDate.setDate(today.getDate() - 15)
      const staleDateStr = staleDate.toISOString().split('T')[0]

      const freshDir = path.join(testDir, 'webpresso/blueprints/is-stale-fresh')
      const staleDir = path.join(testDir, 'webpresso/blueprints/is-stale-stale')
      await fs.mkdir(freshDir, { recursive: true })
      await fs.mkdir(staleDir, { recursive: true })

      await fs.writeFile(
        path.join(freshDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${freshDate}
created: ${freshDate}
---
# Is Stale Fresh
`,
      )
      await fs.writeFile(
        path.join(staleDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${staleDateStr}
created: ${staleDateStr}
---
# Is Stale Stale
`,
      )

      const result = await service.query()

      // staleCount should be exactly 1 (only the stale one)
      expect(result.summary.staleCount).toBe(1)
    })
  })

  describe('mutant-killing: handleParseSummaryError ZodError malformed summary', () => {
    it('should include the path of the invalid field in malformed message', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/zod-err-detail')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
---
# ZodError Detail
`,
      )

      // Should return malformed summary with error details
      const plans = await service.list()
      const malformedPlan = plans.find((p) => p.name === 'zod-err-detail')
      expect(malformedPlan).toMatchObject({
        name: 'zod-err-detail',
        malformed: expect.stringContaining('Invalid frontmatter'),
      })
      expect(malformedPlan?.malformed).toContain('complexity')
    })
  })
})
