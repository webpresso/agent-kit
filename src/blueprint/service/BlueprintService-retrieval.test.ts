import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isBlueprintStatus } from '#query/types'
import { BlueprintNotFoundError } from '#utils/errors'

import { BlueprintService } from './BlueprintService'

describe('BlueprintService - retrieval', () => {
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

  describe('getStalePlans', () => {
    it('should return only stale plans', async () => {
      // Arrange
      const freshDir = path.join(testDir, 'webpresso/blueprints/fresh-feature')
      const staleDir = path.join(testDir, 'webpresso/blueprints/stale-feature')
      await fs.mkdir(freshDir, { recursive: true })
      await fs.mkdir(staleDir, { recursive: true })

      const today = new Date()
      const freshDate = new Date(today)
      freshDate.setDate(today.getDate() - 5)
      const staleDate = new Date(today)
      staleDate.setDate(today.getDate() - 25)

      await fs.writeFile(
        path.join(freshDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${freshDate.toISOString().split('T')[0]}
created: ${freshDate.toISOString().split('T')[0]}
---
# Fresh Feature
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
# Stale Feature
`,
      )

      // Act
      const stalePlans = await service.getStalePlans()

      // Assert
      expect(stalePlans).toHaveLength(1)
      expect(stalePlans[0]?.name).toBe('stale-feature')
    })
  })

  describe('getByGroup', () => {
    it('should return plans in specified group', async () => {
      // Arrange
      const groupedDir1 = path.join(testDir, 'webpresso/blueprints/target-group/feature-a')
      const groupedDir2 = path.join(testDir, 'webpresso/blueprints/target-group/feature-b')
      const otherDir = path.join(testDir, 'webpresso/blueprints/other-group/feature-c')
      await fs.mkdir(groupedDir1, { recursive: true })
      await fs.mkdir(groupedDir2, { recursive: true })
      await fs.mkdir(otherDir, { recursive: true })

      await fs.writeFile(
        path.join(groupedDir1, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-12-01
created: 2024-12-01
---
# Feature A
`,
      )
      await fs.writeFile(
        path.join(groupedDir2, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: M
last_updated: 2024-12-15
created: 2024-12-15
---
# Feature B
`,
      )
      await fs.writeFile(
        path.join(otherDir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: L
last_updated: 2024-12-10
created: 2024-12-10
---
# Feature C
`,
      )

      // Act
      const plans = await service.getByGroup('target-group')

      // Assert
      expect(plans).toHaveLength(2)
      expect(plans.every((p) => p.group === 'target-group')).toBe(true)
    })
  })

  describe('getPlan - fuzzy error messages', () => {
    it('should throw BlueprintNotFoundError with availableSlugs property', async () => {
      // Arrange - create some plans
      const plan1Dir = path.join(testDir, 'webpresso/blueprints/feature-authentication')
      const plan2Dir = path.join(testDir, 'webpresso/blueprints/feature-authorization')
      const plan3Dir = path.join(testDir, 'webpresso/blueprints/database-migration')
      await fs.mkdir(plan1Dir, { recursive: true })
      await fs.mkdir(plan2Dir, { recursive: true })
      await fs.mkdir(plan3Dir, { recursive: true })

      await fs.writeFile(
        path.join(plan1Dir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Feature Authentication
`,
      )
      await fs.writeFile(
        path.join(plan2Dir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Feature Authorization
`,
      )
      await fs.writeFile(
        path.join(plan3Dir, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# Database Migration
`,
      )

      // Act & Assert - verify structured error
      let caughtError: BlueprintNotFoundError | undefined
      try {
        await service.get('feature-auth')
      } catch (error) {
        caughtError = error as BlueprintNotFoundError
      }

      expect(caughtError).toBeInstanceOf(BlueprintNotFoundError)
      expect(caughtError?.requestedSlug).toBe('feature-auth')
      expect(caughtError?.searchedPath).toContain('feature-auth/_overview.md')
      expect(caughtError?.availableSlugs).toHaveLength(3)
      expect(caughtError?.availableSlugs).toContain('feature-authentication')
      expect(caughtError?.availableSlugs).toContain('feature-authorization')
      expect(caughtError?.availableSlugs).toContain('database-migration')
      expect(caughtError?.message).toContain('Plan feature-auth not found')
      expect(caughtError?.message).toContain('Available plans:')
    })

    it.skipIf(process.platform === 'darwin' || process.platform === 'win32')(
      'should include available slugs for case sensitivity mismatch',
      async () => {
        // Note: This test only works on case-sensitive filesystems (Linux).
        // On macOS/Windows with case-insensitive filesystems, fs.access() will succeed
        // with wrong-case paths, so this test is skipped there.

        // Arrange
        const plan1Dir = path.join(testDir, 'webpresso/blueprints/user-dashboard')
        const plan2Dir = path.join(testDir, 'webpresso/blueprints/admin-dashboard')
        const plan3Dir = path.join(testDir, 'webpresso/blueprints/api-gateway')
        await fs.mkdir(plan1Dir, { recursive: true })
        await fs.mkdir(plan2Dir, { recursive: true })
        await fs.mkdir(plan3Dir, { recursive: true })

        await fs.writeFile(
          path.join(plan1Dir, '_overview.md'),
          `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# User Dashboard
`,
        )
        await fs.writeFile(
          path.join(plan2Dir, '_overview.md'),
          `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Admin Dashboard
`,
        )
        await fs.writeFile(
          path.join(plan3Dir, '_overview.md'),
          `---
type: blueprint
status: in-progress
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# API Gateway
`,
        )

        // Act & Assert - case mismatch should include available slugs
        let caughtError: BlueprintNotFoundError | undefined
        try {
          await service.get('USER-DASHBOARD')
        } catch (error) {
          caughtError = error as BlueprintNotFoundError
        }

        expect(caughtError).toBeInstanceOf(BlueprintNotFoundError)
        expect(caughtError?.requestedSlug).toBe('USER-DASHBOARD')
        expect(caughtError?.availableSlugs).toContain('user-dashboard')
        expect(caughtError?.availableSlugs).toContain('admin-dashboard')
        expect(caughtError?.availableSlugs).toContain('api-gateway')
      },
    )

    it('should include searched path in error message and properties', async () => {
      // Arrange - empty plan directory
      const plansDir = path.join(testDir, 'webpresso/blueprints')
      await fs.mkdir(plansDir, { recursive: true })

      // Act & Assert - verify searched path in both message and properties
      let caughtError: BlueprintNotFoundError | undefined
      try {
        await service.get('non-existent')
      } catch (error) {
        caughtError = error as BlueprintNotFoundError
      }

      expect(caughtError).toBeInstanceOf(BlueprintNotFoundError)
      expect(caughtError?.searchedPath).toContain('non-existent/_overview.md')
      expect(caughtError?.message).toContain('Searched:')
      expect(caughtError?.message).toContain('non-existent/_overview.md')
    })

    it('should handle empty plan directory gracefully', async () => {
      // Arrange - empty plan directory
      const plansDir = path.join(testDir, 'webpresso/blueprints')
      await fs.mkdir(plansDir, { recursive: true })

      // Act & Assert - verify empty availableSlugs
      let caughtError: BlueprintNotFoundError | undefined
      try {
        await service.get('some-plan')
      } catch (error) {
        caughtError = error as BlueprintNotFoundError
      }

      expect(caughtError).toBeInstanceOf(BlueprintNotFoundError)
      expect(caughtError?.requestedSlug).toBe('some-plan')
      expect(caughtError?.availableSlugs).toHaveLength(0)
      expect(caughtError?.message).toContain('Plan some-plan not found')
      expect(caughtError?.message).toContain('No plans available')
    })
  })

  describe('summary computation', () => {
    it('should compute accurate summary statistics', async () => {
      // Arrange - create plans with different statuses and groups
      const plan1 = path.join(testDir, 'webpresso/blueprints/group-a/plan-1')
      const plan2 = path.join(testDir, 'webpresso/blueprints/group-a/plan-2')
      const plan3 = path.join(testDir, 'webpresso/blueprints/group-b/plan-3')
      await fs.mkdir(plan1, { recursive: true })
      await fs.mkdir(plan2, { recursive: true })
      await fs.mkdir(plan3, { recursive: true })

      const today = new Date()
      const freshDate = today.toISOString().split('T')[0]
      const staleDate = new Date(today)
      staleDate.setDate(today.getDate() - 20)

      await fs.writeFile(
        path.join(plan1, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${freshDate}
created: ${freshDate}
---
# Plan 1
`,
      )
      await fs.writeFile(
        path.join(plan2, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: M
last_updated: ${freshDate}
created: ${freshDate}
---
# Plan 2
`,
      )
      await fs.writeFile(
        path.join(plan3, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: L
last_updated: ${staleDate.toISOString().split('T')[0]}
created: ${staleDate.toISOString().split('T')[0]}
---
# Plan 3
`,
      )

      // Act
      const result = await service.query()

      // Assert
      expect(result.summary.total).toBe(3)
      expect(result.summary.byStatus).toEqual({
        'in-progress': 2,
        draft: 1,
      })
      expect(result.summary.byGroup).toEqual({
        'group-a': 2,
        'group-b': 1,
      })
      expect(result.summary.staleCount).toBe(1)
      expect(result.summary.avgFreshness).toBeGreaterThan(0)
      expect(result.summary.avgFreshness).toBeLessThanOrEqual(1)
    })
  })

  describe('non-canonical blueprint statuses are rejected', () => {
    it('should reject status "complete" during Zod validation', async () => {
      // Arrange — `complete` is not a valid plan status (use `completed`).
      const planDir = path.join(testDir, 'webpresso/blueprints/old-complete-plan')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: complete
complexity: S
last_updated: 2024-01-01
---
# old-complete-plan - Plan with Old Status
#### Task 1.1: First task
`,
      )

      // Act
      const result = await service.query()

      // Assert - plan should be filtered out due to Zod validation failure
      // `complete` is not in planStatusSchema
      expect(result.plans).toHaveLength(0)
      expect(result.summary.total).toBe(0)
    })

    it('should accept status "completed"', async () => {
      // Arrange
      const planDir = path.join(testDir, 'webpresso/blueprints/new-completed-plan')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: completed
complexity: S
last_updated: 2024-01-01
---
# new-completed-plan - Plan with New Status
#### Task 1.1: First task
`,
      )

      // Act
      const result = await service.query()

      // Assert - should preserve 'completed' status
      expect(result.plans).toHaveLength(1)
      expect(result.plans[0].name).toBe('new-completed-plan')
      expect(result.plans[0].status).toBe('completed')
    })

    it('should reject invalid status values during Zod validation', async () => {
      // Arrange - create plan with completely invalid status
      // This tests that Zod schema validation properly rejects non-enum values
      const planDir = path.join(testDir, 'webpresso/blueprints/invalid-status-plan')
      await fs.mkdir(planDir, { recursive: true })
      await fs.writeFile(
        path.join(planDir, '_overview.md'),
        `---
type: blueprint
status: totally-invalid
complexity: M
last_updated: 2024-01-01
---
# invalid-status-plan - Plan with Invalid Status
#### Task 1.1: First task
`,
      )

      // Act
      const result = await service.query()

      // Assert - plan should be filtered out due to Zod validation failure
      expect(result.plans).toHaveLength(0)
      expect(result.summary.total).toBe(0)
    })

    it('should verify isBlueprintStatus correctly validates all valid statuses', () => {
      // This test documents that isBlueprintStatus is the guard used in toBlueprintRecord
      // even though in practice, Zod validation happens first
      const validStatuses = ['draft', 'planned', 'parked', 'in-progress', 'completed', 'archived']

      for (const status of validStatuses) {
        expect(isBlueprintStatus(status)).toBe(true)
      }

      // `complete` is rejected as a blueprint status
      expect(isBlueprintStatus('complete')).toBe(false)
      expect(isBlueprintStatus('invalid')).toBe(false)
    })
  })
})
