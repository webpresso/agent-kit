/**
 * Cross-linking Integration Tests
 *
 * Tests bidirectional cross-linking between TechDebt and Blueprints
 * Verifies that both documents are updated atomically
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BlueprintService } from './BlueprintService.js'
import { TechDebtService } from './TechDebtService.js'

describe('Cross-linking Integration Tests', () => {
  let testDir: string
  let blueprintService: BlueprintService
  let techDebtService: TechDebtService

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(
      process.cwd(),
      'test-fixtures',
      `cross-linking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )
    await fs.mkdir(testDir, { recursive: true })

    const blueprintsDir = path.join(testDir, 'webpresso/blueprints')
    const techDebtDir = path.join(testDir, 'webpresso/tech-debt')
    await fs.mkdir(blueprintsDir, { recursive: true })
    await fs.mkdir(techDebtDir, { recursive: true })

    // Initialize services
    blueprintService = new BlueprintService(testDir)
    techDebtService = new TechDebtService(testDir)

    // Create test blueprint
    const blueprintPath = path.join(blueprintsDir, 'test-blueprint')
    await fs.mkdir(blueprintPath, { recursive: true })
    await fs.writeFile(
      path.join(blueprintPath, '_overview.md'),
      `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
linked_tech_debt_slugs: []
---

# Test Blueprint

A test blueprint for cross-linking.

## Tasks

### Task 1
- [ ] First task
`,
    )

    // Create test tech debt item
    const techDebtPath = path.join(techDebtDir, 'test-debt')
    await fs.mkdir(techDebtPath, { recursive: true })
    await fs.writeFile(
      path.join(techDebtPath, 'README.md'),
      `---
type: tech-debt
status: needs-remediation
severity: high
category: testing
review_cadence: monthly
last_reviewed: 2024-01-01
linked_blueprints: []
---

# H-001: Test Tech Debt

A test tech debt item for cross-linking.

## Remediation Steps

#### Step 1: First Step
- [ ] Do something
`,
    )
  })

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('TechDebtService.linkToBlueprint', () => {
    it('should link tech debt to blueprint bidirectionally', async () => {
      // Link tech debt to blueprint
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint')

      // Verify tech debt document was updated
      const techDebt = await techDebtService.getTechDebt('test-debt')
      expect(techDebt.linkedBlueprints).toContain('test-blueprint')

      // Verify blueprint document was updated
      const _blueprint = await blueprintService.get('test-blueprint')
      const blueprintContent = await fs.readFile(
        path.join(testDir, 'webpresso/blueprints/test-blueprint/_overview.md'),
        'utf-8',
      )
      expect(blueprintContent).toContain('linked_tech_debt_slugs:')
      expect(blueprintContent).toContain('- test-debt')
    })

    it('should be idempotent - linking twice does not duplicate', async () => {
      // Link twice
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint')
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint')

      // Verify only one entry exists
      const techDebt = await techDebtService.getTechDebt('test-debt')
      const linkCount = techDebt.linkedBlueprints?.filter((bp) => bp === 'test-blueprint').length
      expect(linkCount).toBe(1)

      // Verify blueprint also has only one entry
      const linkedTechDebt = await blueprintService.getLinkedTechDebt('test-blueprint')
      expect(linkedTechDebt).toHaveLength(1)
    })

    it('should throw error when blueprint does not exist', async () => {
      await expect(
        techDebtService.linkToBlueprint('test-debt', 'non-existent-blueprint'),
      ).rejects.toThrow()
    })

    it('should throw error when tech debt does not exist', async () => {
      await expect(
        techDebtService.linkToBlueprint('non-existent-debt', 'test-blueprint'),
      ).rejects.toThrow()
    })
  })

  describe('TechDebtService.unlinkFromBlueprint', () => {
    beforeEach(async () => {
      // Set up linked documents
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint')
    })

    it('should unlink tech debt from blueprint bidirectionally', async () => {
      // Unlink
      await techDebtService.unlinkFromBlueprint('test-debt', 'test-blueprint')

      // Verify tech debt document was updated
      const techDebt = await techDebtService.getTechDebt('test-debt')
      expect(techDebt.linkedBlueprints).not.toContain('test-blueprint')

      // Verify blueprint document was updated
      const linkedTechDebt = await blueprintService.getLinkedTechDebt('test-blueprint')
      expect(linkedTechDebt).toHaveLength(0)
    })

    it('should be idempotent - unlinking twice does not error', async () => {
      // Unlink twice
      await techDebtService.unlinkFromBlueprint('test-debt', 'test-blueprint')
      await expect(
        techDebtService.unlinkFromBlueprint('test-debt', 'test-blueprint'),
      ).resolves.not.toThrow()
    })
  })

  describe('TechDebtService.getLinkedBlueprints', () => {
    beforeEach(async () => {
      // Reset files to clean state (no links)
      const blueprintPath = path.join(testDir, 'webpresso/blueprints/test-blueprint')
      await fs.writeFile(
        path.join(blueprintPath, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
linked_tech_debt_slugs: []
---

# Test Blueprint

A test blueprint for cross-linking.

## Tasks

### Task 1
- [ ] First task
`,
      )

      const techDebtPath = path.join(testDir, 'webpresso/tech-debt/test-debt')
      await fs.writeFile(
        path.join(techDebtPath, 'README.md'),
        `---
type: tech-debt
status: needs-remediation
severity: high
category: testing
review_cadence: monthly
last_reviewed: 2024-01-01
linked_blueprints: []
---

# H-001: Test Tech Debt

A test tech debt item for cross-linking.

## Remediation Steps

#### Step 1: First Step
- [ ] Do something
`,
      )
    })

    it('should return empty array when no blueprints linked', async () => {
      const linked = await techDebtService.getLinkedBlueprints('test-debt')
      expect(linked).toEqual([])
    })

    it('should return linked blueprints', async () => {
      // Link
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint')

      // Get linked blueprints
      const linked = await techDebtService.getLinkedBlueprints('test-debt')
      expect(linked).toHaveLength(1)
      expect(linked[0]?.name).toBe('test-blueprint')
      expect(linked[0]?.title).toBe('Test Blueprint')
    })

    it('should return multiple linked blueprints', async () => {
      // Create second blueprint
      const blueprint2Path = path.join(testDir, 'webpresso/blueprints/test-blueprint-2')
      await fs.mkdir(blueprint2Path, { recursive: true })
      await fs.writeFile(
        path.join(blueprint2Path, '_overview.md'),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
linked_tech_debt_slugs: []
---

# Test Blueprint 2

A second test blueprint.

## Tasks

### Task 1
- [ ] First task
`,
      )

      // Link to both blueprints
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint')
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint-2')

      // Get linked blueprints
      const linked = await techDebtService.getLinkedBlueprints('test-debt')
      expect(linked).toHaveLength(2)
      expect(linked.map((bp) => bp.name).toSorted()).toEqual(['test-blueprint', 'test-blueprint-2'])
    })
  })

  describe('BlueprintService.linkToTechDebt', () => {
    beforeEach(async () => {
      // Reset files to clean state (no links)
      const blueprintPath = path.join(testDir, 'webpresso/blueprints/test-blueprint')
      await fs.writeFile(
        path.join(blueprintPath, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
linked_tech_debt_slugs: []
---

# Test Blueprint

A test blueprint for cross-linking.

## Tasks

### Task 1
- [ ] First task
`,
      )

      const techDebtPath = path.join(testDir, 'webpresso/tech-debt/test-debt')
      await fs.writeFile(
        path.join(techDebtPath, 'README.md'),
        `---
type: tech-debt
status: needs-remediation
severity: high
category: testing
review_cadence: monthly
last_reviewed: 2024-01-01
linked_blueprints: []
---

# H-001: Test Tech Debt

A test tech debt item for cross-linking.

## Remediation Steps

#### Step 1: First Step
- [ ] Do something
`,
      )
    })

    it('should link blueprint to tech debt', async () => {
      await blueprintService.linkToTechDebt('test-blueprint', 'test-debt')

      const linkedTechDebt = await blueprintService.getLinkedTechDebt('test-blueprint')
      expect(linkedTechDebt).toHaveLength(1)
      expect(linkedTechDebt[0]?.slug).toBe('test-debt')
    })

    it('should be idempotent', async () => {
      await blueprintService.linkToTechDebt('test-blueprint', 'test-debt')
      await blueprintService.linkToTechDebt('test-blueprint', 'test-debt')

      const linkedTechDebt = await blueprintService.getLinkedTechDebt('test-blueprint')
      expect(linkedTechDebt).toHaveLength(1)
    })
  })

  describe('BlueprintService.unlinkFromTechDebt', () => {
    beforeEach(async () => {
      await blueprintService.linkToTechDebt('test-blueprint', 'test-debt')
    })

    it('should unlink blueprint from tech debt', async () => {
      await blueprintService.unlinkFromTechDebt('test-blueprint', 'test-debt')

      const linkedTechDebt = await blueprintService.getLinkedTechDebt('test-blueprint')
      expect(linkedTechDebt).toHaveLength(0)
    })
  })

  describe('BlueprintService.getLinkedTechDebt', () => {
    beforeEach(async () => {
      // Reset files to clean state (no links)
      const blueprintPath = path.join(testDir, 'webpresso/blueprints/test-blueprint')
      await fs.writeFile(
        path.join(blueprintPath, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
linked_tech_debt_slugs: []
---

# Test Blueprint

A test blueprint for cross-linking.

## Tasks

### Task 1
- [ ] First task
`,
      )

      const techDebtPath = path.join(testDir, 'webpresso/tech-debt/test-debt')
      await fs.writeFile(
        path.join(techDebtPath, 'README.md'),
        `---
type: tech-debt
status: needs-remediation
severity: high
category: testing
review_cadence: monthly
last_reviewed: 2024-01-01
linked_blueprints: []
---

# H-001: Test Tech Debt

A test tech debt item for cross-linking.

## Remediation Steps

#### Step 1: First Step
- [ ] Do something
`,
      )
    })

    it('should return empty array when no tech debt linked', async () => {
      const linked = await blueprintService.getLinkedTechDebt('test-blueprint')
      expect(linked).toEqual([])
    })

    it('should return linked tech debt items', async () => {
      await blueprintService.linkToTechDebt('test-blueprint', 'test-debt')

      const linked = await blueprintService.getLinkedTechDebt('test-blueprint')
      expect(linked).toHaveLength(1)
      expect(linked[0]?.slug).toBe('test-debt')
      expect(linked[0]?.title).toBe('Test Tech Debt')
      expect(linked[0]?.severity).toBe('high')
    })

    it('should return multiple linked tech debt items', async () => {
      // Create second tech debt item
      const techDebt2Path = path.join(testDir, 'webpresso/tech-debt/test-debt-2')
      await fs.mkdir(techDebt2Path, { recursive: true })
      await fs.writeFile(
        path.join(techDebt2Path, 'README.md'),
        `---
type: tech-debt
status: monitoring
severity: low
category: documentation
review_cadence: quarterly
last_reviewed: 2024-01-01
linked_blueprints: []
---

# H-002: Test Tech Debt 2

A second test tech debt item.

## Remediation Steps

#### Step 1: First Step
- [ ] Do something
`,
      )

      // Link to both tech debt items
      await blueprintService.linkToTechDebt('test-blueprint', 'test-debt')
      await blueprintService.linkToTechDebt('test-blueprint', 'test-debt-2')

      // Get linked tech debt
      const linked = await blueprintService.getLinkedTechDebt('test-blueprint')
      expect(linked).toHaveLength(2)
      expect(linked.map((td) => td.slug).toSorted()).toEqual(['test-debt', 'test-debt-2'])
    })
  })

  describe('Bidirectional consistency', () => {
    beforeEach(async () => {
      // Reset files to clean state (no links)
      const blueprintPath = path.join(testDir, 'webpresso/blueprints/test-blueprint')
      await fs.writeFile(
        path.join(blueprintPath, '_overview.md'),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
linked_tech_debt_slugs: []
---

# Test Blueprint

A test blueprint for cross-linking.

## Tasks

### Task 1
- [ ] First task
`,
      )

      const techDebtPath = path.join(testDir, 'webpresso/tech-debt/test-debt')
      await fs.writeFile(
        path.join(techDebtPath, 'README.md'),
        `---
type: tech-debt
status: needs-remediation
severity: high
category: testing
review_cadence: monthly
last_reviewed: 2024-01-01
linked_blueprints: []
---

# H-001: Test Tech Debt

A test tech debt item for cross-linking.

## Remediation Steps

#### Step 1: First Step
- [ ] Do something
`,
      )
    })

    it('should maintain consistency after link from tech debt side', async () => {
      // Link from tech debt side
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint')

      // Verify both sides are linked
      const techDebtLinks = await techDebtService.getLinkedBlueprints('test-debt')
      const blueprintLinks = await blueprintService.getLinkedTechDebt('test-blueprint')

      expect(techDebtLinks).toHaveLength(1)
      expect(blueprintLinks).toHaveLength(1)
      expect(techDebtLinks[0]?.name).toBe('test-blueprint')
      expect(blueprintLinks[0]?.slug).toBe('test-debt')
    })

    it('should maintain consistency after link from blueprint side', async () => {
      // Link from blueprint side
      await blueprintService.linkToTechDebt('test-blueprint', 'test-debt')

      // Verify both sides are linked
      const techDebtLinks = await techDebtService.getLinkedBlueprints('test-debt')
      const blueprintLinks = await blueprintService.getLinkedTechDebt('test-blueprint')

      expect(techDebtLinks).toHaveLength(1)
      expect(blueprintLinks).toHaveLength(1)
    })

    it('should maintain consistency after unlink from tech debt side', async () => {
      // Set up link
      await techDebtService.linkToBlueprint('test-debt', 'test-blueprint')

      // Unlink from tech debt side
      await techDebtService.unlinkFromBlueprint('test-debt', 'test-blueprint')

      // Verify both sides are unlinked
      const techDebtLinks = await techDebtService.getLinkedBlueprints('test-debt')
      const blueprintLinks = await blueprintService.getLinkedTechDebt('test-blueprint')

      expect(techDebtLinks).toHaveLength(0)
      expect(blueprintLinks).toHaveLength(0)
    })
  })
})
