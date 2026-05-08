import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BlueprintService } from './BlueprintService.js'

describe('BlueprintService - mutant summary', () => {
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

  describe('mutant-killing: computeSummary staleCount and byGroup', () => {
    it('should correctly count stale plans in summary', async () => {
      // Arrange - create one stale and two fresh plans
      const today = new Date()
      const staleDate = new Date(today)
      staleDate.setDate(today.getDate() - 60) // Very stale for in-progress

      const fresh1 = path.join(testDir, 'webpresso/blueprints/fresh-summary-1')
      const fresh2 = path.join(testDir, 'webpresso/blueprints/fresh-summary-2')
      const stale1 = path.join(testDir, 'webpresso/blueprints/stale-summary-1')
      await fs.mkdir(fresh1, { recursive: true })
      await fs.mkdir(fresh2, { recursive: true })
      await fs.mkdir(stale1, { recursive: true })

      const freshDateStr = today.toISOString().split('T')[0]
      const staleDateStr = staleDate.toISOString().split('T')[0]

      await fs.writeFile(
        path.join(fresh1, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${freshDateStr}
created: ${freshDateStr}
---
# Fresh Summary 1
`,
      )
      await fs.writeFile(
        path.join(fresh2, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: M
last_updated: ${freshDateStr}
created: ${freshDateStr}
---
# Fresh Summary 2
`,
      )
      await fs.writeFile(
        path.join(stale1, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: L
last_updated: ${staleDateStr}
created: ${staleDateStr}
---
# Stale Summary 1
`,
      )

      // Act
      const result = await service.query()

      // Assert
      expect(result.summary.total).toBe(3)
      expect(result.summary.staleCount).toBe(1)
      // avgFreshness should be between 0 and 1 (mix of fresh and stale)
      expect(result.summary.avgFreshness).toBeGreaterThan(0)
      expect(result.summary.avgFreshness).toBeLessThan(1)
    })
  })

  describe('mutant-killing: query with lastUpdated having date string', () => {
    it('should parse lastUpdated date string correctly into Date object', async () => {
      // Arrange - create plan with specific last_updated date
      const planDir = path.join(testDir, 'webpresso/blueprints/dated-plan')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-06-15
created: 2024-01-01
---
# Dated Plan
`,
      )

      // Act
      const result = await service.query()

      // Assert - lastUpdated should be parsed from the string
      expect(result.plans).toHaveLength(1)
      const plan = result.plans[0]
      expect(plan?.lastUpdated).toBeInstanceOf(Date)
      // The date should represent 2024-06-15
      expect(plan?.lastUpdated.getFullYear()).toBe(2024)
      expect(plan?.lastUpdated.getMonth()).toBe(5) // 0-indexed, June = 5
      expect(plan?.lastUpdated.getDate()).toBe(15)
    })
  })

  describe('mutant-killing: parseBlueprintSummary exact progress calculation', () => {
    it('should compute progress as exactly 0 when no tasks are completed', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/zero-progress')
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
# Zero Progress
#### Task 1.1: First task
**Status:** todo

#### Task 1.2: Second task
**Status:** todo

#### Task 1.3: Third task
**Status:** todo

`,
      )

      const plans = await service.list()

      expect(plans).toHaveLength(1)
      expect(plans[0]!.name).toBe('zero-progress')
      expect(plans[0]!.taskCount).toBe(3)
      expect(plans[0]!.progress).toBe(0)
    })

    it('should compute progress as exactly 100 when all tasks are completed', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/full-progress')
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
# Full Progress
#### Task 1.1: First task
**Status:** done

- [x] Done
#### Task 1.2: Second task
**Status:** done

- [x] Done
`,
      )

      const plans = await service.list()

      expect(plans).toHaveLength(1)
      expect(plans[0]!.name).toBe('full-progress')
      expect(plans[0]!.taskCount).toBe(2)
      expect(plans[0]!.progress).toBe(100)
    })

    it('should compute progress as exactly 33 for 1 of 3 tasks completed (rounded)', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/partial-progress')
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
# Partial Progress
#### Task 1.1: First task
**Status:** done

- [x] Done
#### Task 1.2: Second task
**Status:** todo

- [ ] Not done
#### Task 1.3: Third task
**Status:** todo

- [ ] Not done
`,
      )

      const plans = await service.list()

      expect(plans).toHaveLength(1)
      expect(plans[0]!.name).toBe('partial-progress')
      expect(plans[0]!.taskCount).toBe(3)
      // Math.round((1/3) * 100) = Math.round(33.333) = 33
      expect(plans[0]!.progress).toBe(33)
    })

    it('should compute progress as exactly 0 when plan has zero tasks', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/no-tasks-progress')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# No Tasks Progress
`,
      )

      const plans = await service.list()

      expect(plans).toHaveLength(1)
      expect(plans[0]!.name).toBe('no-tasks-progress')
      expect(plans[0]!.taskCount).toBe(0)
      // When !tasks.length, progress should be 0 (not divide by zero)
      expect(plans[0]!.progress).toBe(0)
    })

    it('should return exact status and complexity strings from parseBlueprintSummary', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/exact-fields')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: XL
last_updated: 2024-01-01
created: 2024-01-01
---
# Exact Fields
#### Task 1.1: A task
**Status:** todo

`,
      )

      const plans = await service.list()

      expect(plans).toHaveLength(1)
      expect(plans[0]!.status).toBe('draft')
      expect(plans[0]!.complexity).toBe('XL')
      expect(plans[0]!.name).toBe('exact-fields')
    })

    it('should compute progress as exactly 50 for 1 of 2 tasks completed', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/half-progress')
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
# Half Progress
#### Task 1.1: First task
**Status:** done

- [x] Done
#### Task 1.2: Second task
**Status:** todo

- [ ] Not done
`,
      )

      const plans = await service.list()

      expect(plans).toHaveLength(1)
      expect(plans[0]!.progress).toBe(50)
    })
  })

  describe('mutant-killing: listBlueprints includeSpecialFolders', () => {
    it('should include plans in @-prefixed directories via includeSpecialFolders', async () => {
      const specialDir = path.join(testDir, 'webpresso/blueprints/@special-plan')
      await fs.mkdir(specialDir, { recursive: true })
      await fs.writeFile(
        path.join(specialDir, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Special Plan
#### Task 1.1: Task
**Status:** todo

`,
      )

      const plans = await service.list()

      expect(plans).toHaveLength(1)
      expect(plans[0]!.name).toBe('@special-plan')
    })
  })

  describe('mutant-killing: getBlueprint scan fallback with includeSpecialFolders', () => {
    it('should find @-prefixed plan in fallback scan when direct path fails', async () => {
      // Create a plan in a group directory - direct path will fail
      const planDir = path.join(testDir, 'webpresso/blueprints/group/@nested-plan')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Nested Special Plan
#### Task 1.1: Do work
**Status:** todo

`,
      )

      // Search by partial slug - direct path won't match, fallback scan needed
      const plan = await service.get('@nested-plan')

      expect(plan.name).toBe('group/@nested-plan')
      expect(plan.status).toBe('in-progress')
    })
  })

  describe('mutant-killing: toBlueprintRecord isBlueprintStatus fallback to draft', () => {
    it('should set status to the exact plan status when it is a valid BlueprintStatus', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/valid-status-plan')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: planned
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Valid Status Plan
#### Task 1.1: Task
**Status:** todo

`,
      )

      const result = await service.query()

      expect(result.plans).toHaveLength(1)
      expect(result.plans[0]!.status).toBe('planned')
    })

    it('should have tasksCompleted count equal to completed tasks exactly', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/tasks-completed-count')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Tasks Completed Count
#### Task 1.1: First task
**Status:** done

- [x] Acceptance criteria met
#### Task 1.2: Second task
**Status:** todo

- [ ] Not done yet
#### Task 1.3: Third task
**Status:** done

- [x] Acceptance criteria met
#### Task 1.4: Fourth task
**Status:** todo

- [ ] Not done yet
`,
      )

      const result = await service.query()

      expect(result.plans).toHaveLength(1)
      expect(result.plans[0]!.taskCount).toBe(4)
      expect(result.plans[0]!.tasksCompleted).toBe(2)
    })
  })

  describe('mutant-killing: extractPathsFromSection internals', () => {
    it('should strip leading backtick-dash prefix and trailing backtick from paths', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/path-strip')
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
# Path Strip
#### Task 1.1: Work
**Status:** todo

**Files:**
- \`src/clean/path.ts\`
`,
      )

      const result = await service.query()

      expect(result.plans).toHaveLength(1)
      const files = result.plans[0]!.filesTouched
      // The path should be clean without backticks or leading dash
      expect(files).toContain('src/clean/path.ts')
      // Verify it does NOT contain backtick prefixes/suffixes
      for (const f of files) {
        expect(f.startsWith('`')).toBe(false)
        expect(f.endsWith('`')).toBe(false)
        expect(f.startsWith('-')).toBe(false)
      }
    })

    it('should filter out empty paths after stripping', async () => {
      const planDir = path.join(testDir, 'webpresso/blueprints/empty-path-filter')
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
# Empty Path Filter
#### Task 1.1: Work
**Status:** todo

**Files:** \`src/real/file.ts\`
`,
      )

      const result = await service.query()

      expect(result.plans).toHaveLength(1)
      const files = result.plans[0]!.filesTouched
      // Verify no empty strings in the result
      for (const f of files) {
        expect(f.length).toBeGreaterThan(0)
      }
      expect(files).toContain('src/real/file.ts')
    })
  })
})
