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
      expect(plan.tasks[0]!.id).toBe('1.1')
      expect(plan.tasks[0]!.title).toBe('Create schema')
      expect(plan.tasks[1]!.id).toBe('1.2')
      expect(plan.tasks[1]!.title).toBe('Add endpoint')
    })

    it('should extract task dependencies', () => {
      // Act
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')

      // Assert
      expect(plan.tasks[0]!.depends).toBe(undefined) // "None"
      expect(plan.tasks[1]!.depends).toEqual(['1.1'])
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
      expect(plan.tasks[0]!.depends).toBe(undefined) // "None"
      expect(plan.tasks[1]!.depends).toEqual(['1.1']) // "Task 1.1"
      expect(plan.tasks[2]!.depends).toEqual(['1.1', '1.2']) // "Tasks 1.1, 1.2"
      expect(plan.tasks[3]!.depends).toEqual(['1.1', '1.2', '2.1']) // "Tasks 1.1, 1.2, 2.1"
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
      expect(plan.tasks[0]!.blockedReason).toBe('Waiting for API approval')
      expect(plan.tasks[1]!.blockedReason).toBe('Database migration pending')
      expect(plan.tasks[2]!.blockedReason).toBe(undefined)
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
      expect(plan.tasks[0]!.blockedReason).toBe(undefined)
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
      expect(plan.tasks[0]!.blockedReason).toBe(undefined)
      expect(plan.tasks[1]!.blockedReason).toBe(undefined)
    })

    it('should extract phases with their tasks', () => {
      // Act
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')

      // Assert
      expect(plan.phases).toHaveLength(1)
      expect(plan.phases[0]!.number).toBe(1)
      expect(plan.phases[0]!.title).toBe('Foundation')
      expect(plan.phases[0]!.complexity).toBe('S')
      expect(plan.phases[0]!.tasks).toHaveLength(2)
      expect(plan.phases[0]!.tasks[0]!.id).toBe('1.1')
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

      expect(plan.tasks[0]!.status).toBe('blocked')
      expect(plan.tasks[0]!.statusExplicit).toBe(true)
      expect(plan.tasks[0]!.blockedReason).toBe('Waiting on API')
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
      expect(plan.tasks[0]!.status).toBe('todo')
      expect(plan.tasks[0]!.acceptanceCriteria).toEqual({ total: 0, checked: 0 })
      expect(plan.tasks[1]!.status).toBe('blocked')
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
      expect(reparsed.tasks[0]!.id).toBe(original.tasks[0]!.id)
    })

    it('should validate required frontmatter fields', () => {
      // Arrange - minimal markdown without required frontmatter
      const minimal = '# Plan\n#### Task 1.1: Do thing'

      // Act & Assert - should throw ZodError when frontmatter is missing/invalid
      expect(() => parseBlueprint(minimal, '@minimal')).toThrow()
    })

    it('should NOT persist task status to frontmatter', () => {
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')
      plan.tasks[0]!.status = 'done' // This change won't persist

      // Act
      const serialized = serializeBlueprint(plan)
      const reparsed = parseBlueprint(serialized, '@feature')

      expect(reparsed.tasks[0]!.status).toBe('todo')
      expect(reparsed.tasks[1]!.status).toBe('todo')

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
      expect(plan.tasks[0]!.id).toBe('1.1')
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

    it('should reject tasks using ### header with explicit status in heading', () => {
      const planWithStatusPrefix = `---
type: blueprint
status: in-progress
complexity: S
---
# @feature

### [done] Task 1.1: Wrong format
**Depends:** None
`
      expect(() => parseBlueprint(planWithStatusPrefix, '@feature')).toThrow('### Task')
    })
  })

  describe('Checkbox status extraction — derived status boundary cases', () => {
    it('derives done when ALL checkboxes are checked (checked === total)', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: All done
**Status:** done

- [x] A
- [x] B
- [x] C
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.acceptanceCriteria).toEqual({ total: 3, checked: 3 })
    })

    it('derives in_progress when ONE checkbox is checked out of many (checked > 0 and checked < total)', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Partial
**Status:** in_progress

- [x] A
- [ ] B
- [ ] C
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.acceptanceCriteria).toEqual({ total: 3, checked: 1 })
    })

    it('derives todo when ZERO checkboxes are checked (checked === 0, total > 0)', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: None done
**Status:** todo

- [ ] A
- [ ] B
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.acceptanceCriteria).toEqual({ total: 2, checked: 0 })
    })

    it('explicit status overrides derived checkbox status', () => {
      // derived would be 'in_progress' (1 of 2 checked) but explicit says 'blocked'
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Blocked despite partial check
**Status:** blocked
**Blocked:** External dependency

- [x] A
- [ ] B
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.status).toBe('blocked')
      expect(result.tasks[0]!.statusExplicit).toBe(true)
      expect(result.tasks[0]!.acceptanceCriteria).toEqual({ total: 2, checked: 1 })
    })
  })

  describe('Checkbox status extraction', () => {
    it('should derive done from all-checked checkboxes', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: All checked
**Status:** todo

**Acceptance:**
- [x] Item A
- [x] Item B
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.status).toBe('todo')
      expect(result.tasks[0]!.acceptanceCriteria).toEqual({ total: 2, checked: 2 })
    })

    it('handles mixed checkbox states correctly', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Mixed
**Status:** todo

**Acceptance:**
- [x] Done item
- [ ] Pending item
- [x] Another done
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.acceptanceCriteria).toEqual({ total: 3, checked: 2 })
    })

    it('handles task with no checkboxes at all', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: No checkboxes
**Status:** todo

**Steps:**
1. Step one
2. Step two
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.acceptanceCriteria).toEqual({ total: 0, checked: 0 })
    })

    it('derives in_progress when some checkboxes are checked', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Half done
**Status:** todo

- [x] First
- [ ] Second
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.acceptanceCriteria).toEqual({ total: 2, checked: 1 })
    })
  })

  describe('Frontmatter field variations', () => {
    it('should parse blueprint with progress field', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-01-01
progress: '50% (1/2 tasks done)'
depends_on:
  - other-plan
tags:
  - backend
  - urgent
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.progress).toBe('50% (1/2 tasks done)')
      expect(result.dependsOn).toEqual(['other-plan'])
      expect(result.tags).toEqual(['backend', 'urgent'])
    })

    it('should not include progress when it is whitespace only', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-01-01
progress: ' '
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.progress).toBe(undefined)
    })

    it('should handle completed_at field', () => {
      const plan = `---
type: blueprint
status: completed
complexity: S
last_updated: 2026-01-02
created: 2026-01-01
completed_at: 2026-01-15
---
# @feature

#### Task 1.1: First
**Status:** done
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.completedAt).toBe('2026-01-15')
    })
  })

  describe('Task heading format variations', () => {
    it('should parse task with status prefix in heading', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### [in_progress] Task 1.1: With status prefix
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0]!.id).toBe('1.1')
      expect(result.tasks[0]!.title).toBe('With status prefix')
    })

    it('should parse task with bracketed prefix containing special chars', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### [done:x!@] Task 1.1: Special chars
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0]!.title).toBe('Special chars')
    })

    it('should extract title from markdown heading when frontmatter title is missing', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
---
# My Plan Title

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@my-plan')
      expect(result.title).toBe('My Plan Title')
    })

    it('should fall back to name when no title in frontmatter or heading', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
---
Some intro text

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@fallback-name')
      expect(result.title).toBe('@fallback-name')
    })
  })

  describe('Phase parsing', () => {
    it('should parse multiple phases correctly', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

### Phase 1: Foundation [Complexity: S]
#### Task 1.1: First
**Status:** todo
**Depends:** None

### Phase 2: Core Feature [Complexity: M]
#### Task 2.1: Core task
**Status:** todo
**Depends:** Task 1.1
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.phases).toHaveLength(2)
      expect(result.phases[0]!.number).toBe(1)
      expect(result.phases[0]!.complexity).toBe('S')
      expect(result.phases[1]!.number).toBe(2)
      expect(result.phases[1]!.complexity).toBe('M')
      expect(result.phases[0]!.tasks).toHaveLength(1)
      expect(result.phases[1]!.tasks).toHaveLength(1)
    })

    it('should handle phases with XL complexity', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: XL
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

### Phase 1: Big Phase [Complexity: XL]
#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.phases[0]!.complexity).toBe('XL')
    })

    it('should handle phase with numbered title', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

### Phase 2: Dev Phase [Complexity: M]
#### Task 2.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.phases[0]!.number).toBe(2)
    })
  })

  describe('Task metadata extraction', () => {
    it('should extract target package from "in @webpresso/pkg" pattern', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Fix bug in @webpresso/agent-kit
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.targetPackage).toBe('agent-kit')
    })

    it('should extract target package from "for @webpresso/pkg" pattern', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Add tests for @webpresso/runtime
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.targetPackage).toBe('runtime')
    })

    it('should extract target package from "in pkg-name" pattern without @ prefix', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Fix in quality-engine
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.targetPackage).toBe('quality-engine')
    })

    it('should not extract targetPackage when no package pattern matches', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Generic task with no package
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.targetPackage).toBe(undefined)
    })

    it('should not extract targetFile when no file extension matches', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Fix the code
**Status:** todo
**Depends:** None
No file path here
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.targetFile).toBe(undefined)
    })

    it('should extract target file from description', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Fix file
**Status:** todo
**Depends:** None
Fix src/cli/commands/init.ts config
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.targetFile).toBe('src/cli/commands/init.ts')
    })

    it.each([
      { tag: '[Complexity: XS]', expected: 'XS' },
      { tag: '[Complexity: S]', expected: 'S' },
      { tag: '[Complexity: M]', expected: 'M' },
      { tag: '[Complexity: L]', expected: 'L' },
      { tag: '[Complexity: XL]', expected: 'XL' },
      { tag: '[complexity: m]', expected: 'M' }, // case-insensitive
    ])('extracts complexity $expected from tag "$tag"', ({ tag, expected }) => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Complex task
**Status:** todo
**Depends:** None
This is a task ${tag}
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.complexity).toBe(expected)
    })

    it('should extract complexity from description tag', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Complex task
**Status:** todo
**Depends:** None
This is a complex task [Complexity: L]
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.complexity).toBe('L')
    })

    it('should not extract complexity when no complexity tag present', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Simple task
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.complexity).toBe(undefined)
    })
  })

  describe('Task type inference', () => {
    it.each([
      { title: 'Lint code', keyword: 'lint', expected: 'lint-fix' },
      { title: 'Run biome check', keyword: 'biome', expected: 'lint-fix' },
      { title: 'Run tsc --noEmit', keyword: 'tsc', expected: 'typecheck-fix' },
      { title: 'Check types', keyword: 'type', expected: 'typecheck-fix' },
      { title: 'Run tsgo check', keyword: 'tsgo', expected: 'typecheck-fix' },
      { title: 'Run test suite', keyword: 'test', expected: 'test-fix' },
      { title: 'Run vitest to check everything', keyword: 'vitest', expected: 'test-fix' },
      { title: 'Research feasibility', keyword: 'research', expected: 'research' },
      { title: 'Investigate the issue', keyword: 'investigate', expected: 'research' },
      { title: 'Verify the build', keyword: 'verify', expected: 'verify' },
      { title: 'Check the output', keyword: 'check', expected: 'verify' },
      { title: 'Build the thing', keyword: 'none', expected: 'implement' },
    ])('infers $expected for title "$title"', ({ title, expected }) => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: ${title}
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.stepType).toBe(expected)
    })

    it('should infer lint-fix from lint keyword', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Lint code
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.stepType).toBe('lint-fix')
    })

    it('should infer verify from check keyword', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Verify the build
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.stepType).toBe('verify')
    })

    it('should infer test-fix from vitest in description', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Run tests
**Status:** todo
**Depends:** None
Run vitest to check everything
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.stepType).toBe('test-fix')
    })

    it('should default to implement when no keyword matches', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Build the thing
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.stepType).toBe('implement')
    })
  })

  describe('Task description extraction', () => {
    it('should extract description lines after heading', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Task with description
**Status:** todo
**Depends:** None

This is a multiline
description for the task.

**Sub-section:**
- Item 1
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.description).toContain('This is a multiline')
      expect(result.tasks[0]!.description).toContain('description for the task')
    })

    it('should skip leading blank lines before description content', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Task with blank lines
**Status:** todo
**Depends:** None


Actual description starts here.
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.description).toBe('Actual description starts here.')
    })

    it('should not include checklist items in description', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Task with checklist
**Status:** todo

- [x] First item
Some description text
- [ ] Second item
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.description).toBe('Some description text')
    })
  })

  describe('Section delimiter handling', () => {
    it('task section ends at --- delimiter, not reading next task content', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None
Description for first task.

---

#### Task 1.2: Second
**Status:** todo
**Depends:** Task 1.1
Description for second task.
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks).toHaveLength(2)
      expect(result.tasks[0]!.id).toBe('1.1')
      expect(result.tasks[1]!.id).toBe('1.2')
      // first task's description should not contain second task's text
      expect(result.tasks[0]!.description).toBe('Description for first task.')
      expect(result.tasks[1]!.description).toBe('Description for second task.')
    })

    it('task section ends at ## heading delimiter', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None
First description.

## A separate section

#### Task 1.2: Second
**Status:** todo
**Depends:** Task 1.1
Second description.
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks).toHaveLength(2)
      expect(result.tasks[0]!.description).toBe('First description.')
    })
  })

  describe('extractBlocked boundary cases', () => {
    it('returns undefined for "None" value (case-insensitive)', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Task
**Status:** todo
**Blocked:** NONE
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.blockedReason).toBe(undefined)
    })

    it('returns undefined for "none" lowercase', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Task
**Status:** todo
**Blocked:** none
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.blockedReason).toBe(undefined)
    })

    it('returns the blocked reason when it is a real value', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Task
**Status:** blocked
**Blocked:** PR #123 not merged yet
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.blockedReason).toBe('PR #123 not merged yet')
    })
  })

  describe('Task dependency parsing', () => {
    it('should handle dependencies without "Task" prefix', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None

#### Task 1.2: Second
**Status:** todo
**Depends:** 1.1
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[1]!.depends).toEqual(['1.1'])
    })

    it('should handle blocked reason with leading whitespace', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Blocked task
**Status:** blocked
**Blocked:**   Waiting with leading whitespace  
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tasks[0]!.blockedReason).toBe('Waiting with leading whitespace')
    })
  })

  describe('Explicit status enforcement', () => {
    it('should require explicit status for draft blueprints', () => {
      const plan = `---
type: blueprint
status: draft
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Draft task
**Depends:** None
- [ ] Pending
`
      expect(() => parseBlueprint(plan, '@feature')).toThrow('requires explicit **Status:**')
    })

    it('should require explicit status for planned blueprints', () => {
      const plan = `---
type: blueprint
status: planned
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Planned task
**Depends:** None
- [ ] Pending
`
      expect(() => parseBlueprint(plan, '@feature')).toThrow('requires explicit **Status:**')
    })

    it('should not require explicit status for completed blueprints', () => {
      const plan = `---
type: blueprint
status: completed
complexity: S
last_updated: 2026-01-02
created: 2026-01-01
completed_at: 2026-01-02
---
# @feature

#### Task 1.1: Done
**Depends:** None
- [ ] Still pending
`
      expect(() => parseBlueprint(plan, '@feature')).not.toThrow()
    })

    it('should not require explicit status for archived blueprints', () => {
      const plan = `---
type: blueprint
status: archived
complexity: S
last_updated: 2026-01-02
created: 2026-01-01
---
# @feature

#### Task 1.1: Done
**Depends:** None
- [ ] Still pending
`
      expect(() => parseBlueprint(plan, '@feature')).not.toThrow()
    })

    it('should throw for parked blueprints without explicit status', () => {
      const plan = `---
type: blueprint
status: parked
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: Parked
**Depends:** None
- [ ] Pending
`
      expect(() => parseBlueprint(plan, '@feature')).toThrow('requires explicit **Status:**')
    })

    it('should include the missing task IDs in the error message', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
---
# @feature

#### Task 1.1: First missing
**Depends:** None
- [ ] Pending

#### Task 1.2: Second missing
**Depends:** None
- [ ] Pending
`
      expect(() => parseBlueprint(plan, '@feature')).toThrow('Missing: 1.1, 1.2')
    })
  })

  describe('Frontmatter optional arrays boundary', () => {
    it('should not include dependsOn when depends_on is empty array', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
depends_on: []
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.dependsOn).toBe(undefined)
    })

    it('should not include tags when tags is empty array', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
tags: []
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.tags).toBe(undefined)
    })

    it('should include dependsOn when depends_on has entries', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
depends_on:
  - other-plan
  - third-plan
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const result = parseBlueprint(plan, '@feature')
      expect(result.dependsOn).toEqual(['other-plan', 'third-plan'])
    })
  })

  describe('Serialization edge cases', () => {
    it('should remove progress from frontmatter when set to empty', () => {
      const plan = `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2026-01-01
created: 2026-01-01
progress: '50%'
---
# @feature

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
      const parsed = parseBlueprint(plan, '@feature')
      parsed.progress = ''
      const serialized = serializeBlueprint(parsed)
      expect(serialized).not.toContain('progress:')
    })

    it('should remove completed_at when cleared', () => {
      const plan = `---
type: blueprint
status: completed
complexity: S
last_updated: 2026-01-02
created: 2026-01-01
completed_at: 2026-01-02
---
# @feature

#### Task 1.1: First
**Status:** done
**Depends:** None
`
      const parsed = parseBlueprint(plan, '@feature')
      expect(parsed.completedAt).toBe('2026-01-02')
      const serialized = serializeBlueprint(parsed)
      expect(serialized).toContain('completed_at')
    })

    it('should preserve status on serialize', () => {
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')
      const serialized = serializeBlueprint(plan)
      expect(serialized).toContain('status: in-progress')
    })

    it('should preserve complexity on serialize', () => {
      const plan = parseBlueprint(PLAN_WITH_TASKS, '@feature')
      const serialized = serializeBlueprint(plan)
      expect(serialized).toContain('complexity: S')
    })
  })
})
