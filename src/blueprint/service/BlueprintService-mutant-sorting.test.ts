import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BlueprintService } from './BlueprintService'

describe('BlueprintService - mutant sorting', () => {
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

  describe('mutant-killing: sorting direction', () => {
    it('should sort by freshness descending (higher scores first)', async () => {
      // Arrange
      const freshDir = path.join(testDir, 'webpresso/blueprints/fresh-sort')
      const staleDir = path.join(testDir, 'webpresso/blueprints/stale-sort')
      await fs.mkdir(freshDir, { recursive: true })
      await fs.mkdir(staleDir, { recursive: true })

      const today = new Date()
      const freshDate = new Date(today)
      freshDate.setDate(today.getDate() - 1)
      const staleDate = new Date(today)
      staleDate.setDate(today.getDate() - 50)

      await fs.writeFile(
        path.join(freshDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${freshDate.toISOString().split('T')[0]}
created: ${freshDate.toISOString().split('T')[0]}
---
# Fresh Sort
`,
      )
      await fs.writeFile(
        path.join(staleDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: ${staleDate.toISOString().split('T')[0]}
created: ${staleDate.toISOString().split('T')[0]}
---
# Stale Sort
`,
      )

      // Act - sort by freshness descending (higher scores first = fresher first)
      const result = await service.query({
        sort: { field: 'freshness', direction: 'desc' },
      })

      // Assert - fresh plan should come first when sorting desc
      expect(result.plans).toHaveLength(2)
      expect(result.plans[0]?.name).toBe('fresh-sort')
      expect(result.plans[1]?.name).toBe('stale-sort')
      expect(result.plans[0]?.freshness.score).toBeGreaterThan(
        result.plans[1]?.freshness.score ?? 0,
      )
    })

    it('should sort by lastUpdated ascending (older first)', async () => {
      // Arrange
      const olderDir = path.join(testDir, 'webpresso/blueprints/older-sort')
      const newerDir = path.join(testDir, 'webpresso/blueprints/newer-sort')
      await fs.mkdir(olderDir, { recursive: true })
      await fs.mkdir(newerDir, { recursive: true })

      await fs.writeFile(
        path.join(olderDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2023-01-01
created: 2023-01-01
---
# Older Sort
`,
      )
      await fs.writeFile(
        path.join(newerDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: M
last_updated: 2024-06-15
created: 2024-06-15
---
# Newer Sort
`,
      )

      // Act - sort by lastUpdated ascending (older dates first)
      const result = await service.query({
        sort: { field: 'lastUpdated', direction: 'asc' },
      })

      // Assert - older plan should come first
      expect(result.plans).toHaveLength(2)
      expect(result.plans[0]?.name).toBe('older-sort')
      expect(result.plans[1]?.name).toBe('newer-sort')
      expect(result.plans[0]?.lastUpdated.getTime()).toBeLessThan(
        result.plans[1]?.lastUpdated.getTime() ?? 0,
      )
    })

    it('should sort by slug descending (reverse alphabetical)', async () => {
      // Arrange
      const alphaDir = path.join(testDir, 'webpresso/blueprints/alpha-slug')
      const zetaDir = path.join(testDir, 'webpresso/blueprints/zeta-slug')
      await fs.mkdir(alphaDir, { recursive: true })
      await fs.mkdir(zetaDir, { recursive: true })

      await fs.writeFile(
        path.join(alphaDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Alpha Slug
`,
      )
      await fs.writeFile(
        path.join(zetaDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Zeta Slug
`,
      )

      // Act - sort by slug descending (reverse alphabetical)
      const result = await service.query({
        sort: { field: 'name', direction: 'desc' },
      })

      // Assert - zeta should come first in descending order
      expect(result.plans).toHaveLength(2)
      expect(result.plans[0]?.name).toBe('zeta-slug')
      expect(result.plans[1]?.name).toBe('alpha-slug')
    })

    it('should sort by status descending (reverse alphabetical)', async () => {
      // Arrange
      const archivedDir = path.join(testDir, 'webpresso/blueprints/arch-status')
      const progressDir = path.join(testDir, 'webpresso/blueprints/prog-status')
      await fs.mkdir(archivedDir, { recursive: true })
      await fs.mkdir(progressDir, { recursive: true })

      await fs.writeFile(
        path.join(archivedDir, '_overview.md'),
        `---
type: blueprint
status: archived
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Archived Status
`,
      )
      await fs.writeFile(
        path.join(progressDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Progress Status
`,
      )

      // Act - sort by status descending
      const result = await service.query({
        sort: { field: 'status', direction: 'desc' },
      })

      // Assert - in-progress should come first in descending order ('i' > 'a')
      expect(result.plans).toHaveLength(2)
      expect(result.plans[0]?.status).toBe('in-progress')
      expect(result.plans[1]?.status).toBe('archived')
    })
  })

  describe('mutant-killing: computeSummary with empty plans', () => {
    it('should return avgFreshness of 1.0 when no plans exist', async () => {
      // Arrange - create empty blueprints directory
      const plansDir = path.join(testDir, 'webpresso/blueprints')
      await fs.mkdir(plansDir, { recursive: true })

      // Act
      const result = await service.query()

      // Assert - avgFreshness should be exactly 1.0 for empty plans
      expect(result.plans).toHaveLength(0)
      expect(result.summary.total).toBe(0)
      expect(result.summary.avgFreshness).toBe(1.0)
      expect(result.summary.staleCount).toBe(0)
      expect(result.summary.byStatus).toEqual({})
      expect(result.summary.byGroup).toEqual({})
    })
  })

  describe('mutant-killing: getBlueprint endsWith branch', () => {
    it('should find a plan by partial slug matching via endsWith', async () => {
      // Arrange - create a grouped plan where slug is "my-group/sub-feature"
      // but we search by just "sub-feature"
      const groupedDir = path.join(testDir, 'webpresso/blueprints/my-group/sub-feature')
      await fs.mkdir(groupedDir, { recursive: true })
      await fs.writeFile(
        path.join(groupedDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Sub Feature
#### Task 1.1: Do something
**Status:** todo

`,
      )

      // Act - search by partial slug (just the leaf name, not the full group/slug)
      const plan = await service.get('sub-feature')

      // Assert - should find the plan via endsWith matching
      expect(plan.name).toBe('my-group/sub-feature')
      expect(plan.status).toBe('in-progress')
      expect(plan.tasks).toHaveLength(1)
    })
  })

  describe('mutant-killing: matchesGroupFilter with null group', () => {
    it('should exclude plans with null group when filtering by group', async () => {
      // Arrange - create a standalone plan (no group) and a grouped plan
      const standaloneDir = path.join(testDir, 'webpresso/blueprints/standalone-nogr')
      const groupedDir = path.join(testDir, 'webpresso/blueprints/team-x/grouped-plan')
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
# Standalone No Group
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
# Grouped Plan
`,
      )

      // Act - filter by the specific group
      const result = await service.query({
        filters: { group: 'team-x' },
      })

      // Assert - only the grouped plan should match, standalone has group=null
      expect(result.plans).toHaveLength(1)
      expect(result.plans[0]?.group).toBe('team-x')
      expect(result.plans[0]?.name).toBe('team-x/grouped-plan')
    })
  })

  describe('mutant-killing: matchesAllFilters short-circuit', () => {
    it('should apply all filter conditions simultaneously', async () => {
      // Arrange - create plans that match some but not all filter conditions
      const matchAllDir = path.join(testDir, 'webpresso/blueprints/grp/match-all')
      const matchStatusOnlyDir = path.join(testDir, 'webpresso/blueprints/match-status-only')
      const matchGroupOnlyDir = path.join(testDir, 'webpresso/blueprints/grp/match-group-only')
      await fs.mkdir(matchAllDir, { recursive: true })
      await fs.mkdir(matchStatusOnlyDir, { recursive: true })
      await fs.mkdir(matchGroupOnlyDir, { recursive: true })

      await fs.writeFile(
        path.join(matchAllDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Match All
`,
      )
      await fs.writeFile(
        path.join(matchStatusOnlyDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Match Status Only
`,
      )
      await fs.writeFile(
        path.join(matchGroupOnlyDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# Match Group Only
`,
      )

      // Act - filter by both status AND group AND complexity
      const result = await service.query({
        filters: {
          status: 'in-progress',
          group: 'grp',
          complexity: 'M',
        },
      })

      // Assert - only the plan that matches ALL conditions should be returned
      expect(result.plans).toHaveLength(1)
      expect(result.plans[0]?.name).toBe('grp/match-all')
    })
  })

  describe('mutant-killing: isBlueprintStatus fallback in toBlueprintRecord', () => {
    it('should set complexity to the exact value from the plan when valid', async () => {
      // Arrange - test each valid complexity value
      const complexities = ['XS', 'S', 'M', 'L', 'XL'] as const
      for (const c of complexities) {
        const dir = path.join(testDir, `webpresso/blueprints/complexity-${c.toLowerCase()}`)
        await fs.mkdir(dir, { recursive: true })
        await fs.writeFile(
          path.join(dir, '_overview.md'),
          `---
type: blueprint
status: draft
complexity: ${c}
last_updated: 2024-01-01
created: 2024-01-01
---
# Complexity ${c}
`,
        )
      }

      // Act
      const result = await service.query({
        sort: { field: 'name', direction: 'asc' },
      })

      // Assert - each plan should have its exact complexity value
      expect(result.plans).toHaveLength(5)
      expect(result.plans[0]?.complexity).toBe('L')
      expect(result.plans[1]?.complexity).toBe('M')
      expect(result.plans[2]?.complexity).toBe('S')
      expect(result.plans[3]?.complexity).toBe('XL')
      expect(result.plans[4]?.complexity).toBe('XS')
    })
  })

  describe('mutant-killing: extractPathsFromSection filter and replace', () => {
    it('should handle file paths with backtick markers on list items', async () => {
      // Arrange - create plan with files listed as markdown bullet points with backticks
      const planDir = path.join(testDir, 'webpresso/blueprints/list-files-plan')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# List Files Plan
#### Task 1.1: Update files
**Status:** todo

**Files:**
- \`src/components/Header.tsx\`
- \`src/components/Footer.tsx\`
- \`src/styles/main.css\`
`,
      )

      // Act
      const result = await service.query()

      // Assert - all three paths should be extracted correctly
      expect(result.plans).toHaveLength(1)
      const files = result.plans[0]?.filesTouched ?? []
      expect(files.length).toBeGreaterThanOrEqual(3)
      expect(files).toContain('src/components/Header.tsx')
      expect(files).toContain('src/components/Footer.tsx')
      expect(files).toContain('src/styles/main.css')
    })
  })
})
