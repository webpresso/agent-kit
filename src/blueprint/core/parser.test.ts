import { describe, expect, it } from 'vitest'

import { parseBlueprint, serializeBlueprint } from './parser.js'

const SAMPLE_PLAN_MARKDOWN = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---

# @sample-feature

> **Status**: 🔵 In Progress
> **Complexity**: S
`

const PLAN_WITH_TASKS = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---

# @feature

## Implementation

### Phase 1: Foundation [Complexity: S]

#### Task 1.1: Create schema

**Status:** todo

**Depends:** None

#### Task 1.2: Add endpoint

**Status:** todo

**Depends:** Task 1.1
`

describe('PlanParser', () => {
  describe('parseBlueprint', () => {
    it('should parse frontmatter correctly', () => {
      // Act
      const plan = parseBlueprint(SAMPLE_PLAN_MARKDOWN, '@sample-feature')

      // Assert
      expect(plan.name).toBe('@sample-feature')
      expect(plan.status).toBe('in-progress')
      expect(plan.complexity).toBe('S')
      expect(plan.lastUpdated).toBe('2026-01-01')
    })

    it('should extract tasks from markdown headings', () => {
      // Act
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')

      // Assert
      expect(plan.tasks).toHaveLength(2)
      expect(plan.tasks[0].id).toBe('1.1')
      expect(plan.tasks[0].title).toBe('Create schema')
      expect(plan.tasks[1].id).toBe('1.2')
      expect(plan.tasks[1].title).toBe('Add endpoint')
    })

    it('should extract task dependencies', () => {
      // Act
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')

      // Assert
      expect(plan.tasks[0].depends).toBe(undefined) // "None"
      expect(plan.tasks[1].depends).toEqual(['1.1'])
    })

    it('should extract multiple dependencies with various formats', () => {
      // Arrange - test "Tasks X.Y, X.Z" format and bare IDs
      const planWithMultipleDeps = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None

#### Task 1.2: Second
**Status:** todo
**Depends:** Task 1.1

#### Task 2.1: Third with plural prefix
**Status:** todo
**Depends:** Tasks 1.1, 1.2

#### Task 3.1: Fourth with all deps
**Status:** todo
**Depends:** Tasks 1.1, 1.2, 2.1
`
      // Act
      const plan = parseBlueprint(planWithMultipleDeps, '@feature')

      // Assert
      expect(plan.tasks[0].depends).toBe(undefined) // "None"
      expect(plan.tasks[1].depends).toEqual(['1.1']) // "Task 1.1"
      expect(plan.tasks[2].depends).toEqual(['1.1', '1.2']) // "Tasks 1.1, 1.2"
      expect(plan.tasks[3].depends).toEqual(['1.1', '1.2', '2.1']) // "Tasks 1.1, 1.2, 2.1"
    })

    it('should extract blocked reason from task section', () => {
      // Arrange
      const planWithBlocked = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: First task

**Status:** blocked

**Blocked:** Waiting for API approval

#### Task 1.2: Second task

**Status:** blocked

**Blocked:** Database migration pending

#### Task 1.3: Third task

**Status:** todo

No blocked status here
`
      // Act
      const plan = parseBlueprint(planWithBlocked, '@feature')

      // Assert
      expect(plan.tasks[0].blockedReason).toBe('Waiting for API approval')
      expect(plan.tasks[1].blockedReason).toBe('Database migration pending')
      expect(plan.tasks[2].blockedReason).toBe(undefined)
    })

    it('should handle "None" as no blocked reason', () => {
      // Arrange
      const planWithNone = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: First task

**Status:** todo

**Blocked:** None
`
      // Act
      const plan = parseBlueprint(planWithNone, '@feature')

      // Assert
      expect(plan.tasks[0].blockedReason).toBe(undefined)
    })

    it('should handle empty blocked reason gracefully', () => {
      // Arrange
      const planWithEmpty = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: With empty blocked

**Status:** todo

**Blocked:** 

#### Task 1.2: With only whitespace

**Status:** todo

**Blocked:**   
`
      // Act
      const plan = parseBlueprint(planWithEmpty, '@feature')

      // Assert - empty or whitespace-only reasons should be treated as undefined
      expect(plan.tasks[0].blockedReason).toBe(undefined)
      expect(plan.tasks[1].blockedReason).toBe(undefined)
    })

    it('should extract phases with their tasks', () => {
      // Act
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')

      // Assert
      expect(plan.phases).toHaveLength(1)
      expect(plan.phases[0].number).toBe(1)
      expect(plan.phases[0].title).toBe('Foundation')
      expect(plan.phases[0].complexity).toBe('S')
      expect(plan.phases[0].tasks).toHaveLength(2)
      expect(plan.phases[0].tasks[0].id).toBe('1.1')
    })

    it('requires explicit task status for executable blueprints', () => {
      // Arrange - status is determined by checkbox state, not frontmatter
      const planWithCheckboxes = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: First (all checked = completed)

**Acceptance:**
- [x] Criterion A
- [x] Criterion B

#### Task 1.2: Second (some checked = running)

**Acceptance:**
- [x] Criterion A
- [ ] Criterion B

#### Task 1.3: Third (none checked = pending)

**Acceptance:**
- [ ] Criterion A
- [ ] Criterion B
`
      expect(() => parseBlueprint(planWithCheckboxes, '@feature')).toThrow(
        'requires explicit **Status:** on every task',
      )
    })

    it('prefers explicit task status when present', () => {
      const planWithExplicitStatus = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Explicitly blocked

**Status:** blocked
**Blocked:** Waiting on API

**Acceptance:**
- [ ] Criterion A
- [ ] Criterion B
`

      const plan = parseBlueprint(planWithExplicitStatus, '@feature')

      expect(plan.tasks[0].status).toBe('blocked')
      expect(plan.tasks[0].statusExplicit).toBe(true)
      expect(plan.tasks[0].blockedReason).toBe('Waiting on API')
    })

    it('still parses explicit status when no checkboxes exist', () => {
      // Arrange - tasks without checkboxes
      const planNoCheckboxes = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature
#### Task 1.1: First
**Status:** todo
**Steps:**
1. Do thing
#### Task 1.2: Second
**Status:** blocked
**Blocked:** Waiting on API
`
      // Act
      const plan = parseBlueprint(planNoCheckboxes, '@feature')

      // Assert
      expect(plan.tasks[0].status).toBe('todo')
      expect(plan.tasks[0].acceptanceCriteria).toEqual({ total: 0, checked: 0 })
      expect(plan.tasks[1].status).toBe('blocked')
    })
  })

  describe('serializeBlueprint', () => {
    it('should round-trip without data loss', () => {
      // Arrange
      const original = parseBlueprint(PLAN_WITH_TASKS, '@feature')

      // Act
      const serialized = serializeBlueprint(original)
      const reparsed = parseBlueprint(serialized, '@feature')

      // Assert - critical data preserved
      expect(reparsed.name).toBe(original.name)
      expect(reparsed.status).toBe(original.status)
      expect(reparsed.complexity).toBe(original.complexity)
      expect(reparsed.tasks.length).toBe(original.tasks.length)
      expect(reparsed.tasks[0].id).toBe(original.tasks[0].id)
    })

    it('should validate required frontmatter fields', () => {
      // Arrange - minimal markdown without required frontmatter
      const minimal = '# Plan\n#### Task 1.1: Do thing'

      // Act & Assert - should throw ZodError when frontmatter is missing/invalid
      expect(() => parseBlueprint(minimal, '@minimal')).toThrow()
    })

    it('should NOT persist task status to frontmatter', () => {
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')
      plan.tasks[0].status = 'done' // This change won't persist

      // Act
      const serialized = serializeBlueprint(plan)
      const reparsed = parseBlueprint(serialized, '@feature')

      expect(reparsed.tasks[0].status).toBe('todo')
      expect(reparsed.tasks[1].status).toBe('todo')

      // Also verify no 'tasks' key in frontmatter
      expect(serialized).not.toContain('tasks:')
    })

    it('persists generated progress and completed_at in frontmatter', () => {
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')
      plan.progress = '50% (1/2 tasks done, 0 blocked, updated 2026-01-01)'
      plan.completedAt = '2026-01-02'

      const serialized = serializeBlueprint(plan)

      expect(serialized).toContain(
        "progress: '50% (1/2 tasks done, 0 blocked, updated 2026-01-01)'",
      )
      expect(serialized).toContain("completed_at: '2026-01-02'")
    })

    it('should strip obsolete tasks map from frontmatter on serialize', () => {
      // Arrange — embedded per-task map in frontmatter is not part of the contract
      const planWithTasksKey = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
tasks:
  "1.1":
    status: done
---
# @feature
#### Task 1.1: First
**Status:** todo
`
      const plan = parseBlueprint(planWithTasksKey, '@feature')

      // Act
      const serialized = serializeBlueprint(plan)

      // Assert
      expect(serialized).not.toContain('tasks:')
      expect(serialized).not.toContain('"1.1"')
    })
  })

  describe('Blueprint format validation', () => {
    it('should throw error when tasks use ### (3 hashes) instead of #### (4 hashes)', () => {
      // Arrange
      const planWithWrongFormat = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
---
# @feature

### Task 1.1: Wrong format
**Depends:** None
- [ ] Test criterion
`
      // Act & Assert
      expect(() => parseBlueprint(planWithWrongFormat, '@feature')).toThrow(
        "Plan parsing failed: Found 1 task(s) using '### Task' (3 hashes)",
      )
    })

    it('should throw with count when multiple tasks use wrong format', () => {
      // Arrange
      const planWithMultipleWrong = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-01-01
---
# @feature

### Task 1.1: Wrong
- [ ] A

### Task 1.2: Also wrong
- [ ] B

### Task 2.1: Still wrong
- [ ] C
`
      // Act & Assert
      expect(() => parseBlueprint(planWithMultipleWrong, '@feature')).toThrow(
        "Found 3 task(s) using '### Task' (3 hashes)",
      )
    })

    it('should include reference to docs in error message', () => {
      // Arrange
      const planWithWrongFormat = `---
type: blueprint
status: in-progress
complexity: S
---
### Task 1.1: Wrong
`
      // Act & Assert
      expect(() => parseBlueprint(planWithWrongFormat, '@feature')).toThrow(
        'docs/templates/blueprint.md',
      )
    })

    it('should not throw when tasks use correct #### format', () => {
      // Arrange
      const planWithCorrectFormat = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
---
# @feature

#### Task 1.1: Correct format
**Status:** todo
**Depends:** None
- [ ] Test criterion
`
      // Act & Assert
      expect(() => parseBlueprint(planWithCorrectFormat, '@feature')).not.toThrow()
      const plan = parseBlueprint(planWithCorrectFormat, '@feature')
      expect(plan.tasks).toHaveLength(1)
      expect(plan.tasks[0].id).toBe('1.1')
    })

    it('should ignore ### headings that are not tasks', () => {
      // Arrange
      const planWithPhaseHeadings = `---
type: blueprint
status: in-progress
complexity: S
---
# @feature

### Phase 1: Foundation

#### Task 1.1: Correct task
**Status:** todo
- [ ] Test

### Overview
Some content

#### Task 1.2: Another task
**Status:** todo
- [ ] Test
`
      // Act & Assert
      expect(() => parseBlueprint(planWithPhaseHeadings, '@feature')).not.toThrow()
      const plan = parseBlueprint(planWithPhaseHeadings, '@feature')
      expect(plan.tasks).toHaveLength(2)
    })
  })
})
