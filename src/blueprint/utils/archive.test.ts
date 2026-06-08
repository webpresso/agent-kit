/**
 * Archive Operations Tests
 */

import type { Blueprint, Task } from '#core/parser'
import type { BlueprintTaskStatus } from '#core/schema'

import * as fs from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoist the mock flag so it is available before module evaluation.
const mockWriteFileError = { active: false }

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    writeFile: vi.fn<typeof actual.writeFile>((...args: Parameters<typeof actual.writeFile>) => {
      if (mockWriteFileError.active) {
        return Promise.reject(
          Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
        )
      }
      return (
        actual.writeFile as unknown as (
          ...a: Parameters<typeof actual.writeFile>
        ) => ReturnType<typeof actual.writeFile>
      )(...args)
    }),
  }
})

import { archiveBlueprint, validateAllTasksDone } from './archive.js'

/**
 * Creates a mock task for testing.
 */
function createTask(
  id: string,
  title: string,
  status: BlueprintTaskStatus,
  total = 0,
  checked = 0,
): Task {
  return {
    id,
    title,
    status,
    stepType: 'task',
    acceptanceCriteria: { total, checked },
  }
}

/**
 * Creates a mock plan for testing.
 */
function createPlan(tasks: Task[]): Blueprint {
  return {
    name: 'test-plan',
    type: 'blueprint',
    title: 'Test Plan',
    status: 'in-progress',
    complexity: 'M',
    lastUpdated: '2026-02-01',
    tasks,
    phases: [],
    raw: '',
  }
}

describe('validateAllTasksDone', () => {
  describe('valid plans', () => {
    it('returns valid for plan with all tasks done', () => {
      const tasks = [
        createTask('1.1', 'Task 1', 'done', 3, 3),
        createTask('1.2', 'Task 2', 'done', 2, 2),
        createTask('2.1', 'Task 3', 'done', 4, 4),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(true)
      expect(result.incompleteTasks).toBe(undefined)
      expect(result.message).toBe(undefined)
    })

    it('returns valid for plan with all tasks done and no acceptance criteria', () => {
      const tasks = [
        createTask('1.1', 'Task 1', 'done', 0, 0),
        createTask('1.2', 'Task 2', 'done', 0, 0),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(true)
    })

    it('returns valid for empty plan', () => {
      const plan = createPlan([])

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(true)
    })
  })

  describe('invalid plans - task status', () => {
    it('returns invalid for plan with pending tasks', () => {
      const tasks = [
        createTask('1.1', 'Task 1', 'done', 2, 2),
        createTask('1.2', 'Task 2', 'todo', 3, 0),
        createTask('2.1', 'Task 3', 'done', 1, 1),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toEqual([{ id: '1.2', title: 'Task 2', status: 'todo' }])
      expect(result.message).toBe('1 task incomplete: Task 1.2 (todo)')
    })

    it('returns invalid for plan with in-progress tasks', () => {
      const tasks = [
        createTask('1.1', 'Task 1', 'done', 2, 2),
        createTask('1.2', 'Task 2', 'in-progress', 3, 2),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toEqual([
        { id: '1.2', title: 'Task 2', status: 'in-progress' },
      ])
      expect(result.message).toBe('1 task incomplete: Task 1.2 (in-progress)')
    })

    it('returns invalid for plan with all tasks incomplete', () => {
      const tasks = [
        createTask('1.1', 'Task 1', 'todo', 3, 0),
        createTask('1.2', 'Task 2', 'in-progress', 2, 1),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toHaveLength(2)
      expect(result.message).toBe('2 tasks incomplete: Task 1.1 (todo), Task 1.2 (in-progress)')
    })
  })

  describe('invalid plans - acceptance criteria', () => {
    it('returns invalid for task marked completed but with unchecked criteria', () => {
      const tasks = [
        createTask('1.1', 'Task 1', 'done', 3, 2), // 2/3 checked but status=done
        createTask('1.2', 'Task 2', 'done', 2, 2),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toEqual([{ id: '1.1', title: 'Task 1', status: 'done' }])
      expect(result.message).toBe('1 task incomplete: Task 1.1 (done)')
    })

    it('returns invalid for task marked completed but with no criteria checked', () => {
      const tasks = [
        createTask('1.1', 'Task 1', 'done', 3, 0), // 0/3 checked
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toEqual([{ id: '1.1', title: 'Task 1', status: 'done' }])
    })
  })

  describe('edge cases', () => {
    it('handles task with empty title', () => {
      const tasks = [createTask('1.1', '', 'todo', 0, 0)]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toEqual([{ id: '1.1', title: '', status: 'todo' }])
    })

    it('handles multiple incomplete tasks with different statuses', () => {
      const tasks = [
        createTask('1.1', 'Parser', 'in-progress', 3, 2),
        createTask('1.2', 'Validator', 'todo', 2, 0),
        createTask('2.1', 'Tests', 'todo', 4, 0),
        createTask('2.2', 'Docs', 'done', 1, 1),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toHaveLength(3)
      expect(result.incompleteTasks).toEqual([
        { id: '1.1', title: 'Parser', status: 'in-progress' },
        { id: '1.2', title: 'Validator', status: 'todo' },
        { id: '2.1', title: 'Tests', status: 'todo' },
      ])
      expect(result.message).toBe(
        '3 tasks incomplete: Task 1.1 (in-progress), Task 1.2 (todo), Task 2.1 (todo)',
      )
    })

    it('handles task IDs with multiple digits', () => {
      const tasks = [
        createTask('10.15', 'Task 10.15', 'todo', 0, 0),
        createTask('11.1', 'Task 11.1', 'done', 1, 1),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toEqual([{ id: '10.15', title: 'Task 10.15', status: 'todo' }])
    })

    it('handles tasks with special characters in title', () => {
      const tasks = [createTask('1.1', 'Task with "quotes" & <special> chars', 'todo', 0, 0)]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toEqual([
        {
          id: '1.1',
          title: 'Task with "quotes" & <special> chars',
          status: 'todo',
        },
      ])
    })
  })

  describe('message formatting', () => {
    it('uses singular "task" for single incomplete task', () => {
      const tasks = [createTask('1.1', 'Task 1', 'todo', 0, 0)]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.message).toBe('1 task incomplete: Task 1.1 (todo)')
    })

    it('uses plural "tasks" for multiple incomplete tasks', () => {
      const tasks = [
        createTask('1.1', 'Task 1', 'todo', 0, 0),
        createTask('1.2', 'Task 2', 'in-progress', 2, 1),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.message).toBe('2 tasks incomplete: Task 1.1 (todo), Task 1.2 (in-progress)')
    })

    it('includes all incomplete tasks in message', () => {
      const tasks = [
        createTask('1.1', 'Alpha', 'todo', 0, 0),
        createTask('1.2', 'Beta', 'in-progress', 3, 2),
        createTask('2.1', 'Gamma', 'todo', 2, 0),
        createTask('2.2', 'Delta', 'done', 1, 1),
        createTask('3.1', 'Epsilon', 'in-progress', 4, 1),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.message).toContain('4 tasks incomplete')
      expect(result.message).toContain('Task 1.1 (todo)')
      expect(result.message).toContain('Task 1.2 (in-progress)')
      expect(result.message).toContain('Task 2.1 (todo)')
      expect(result.message).toContain('Task 3.1 (in-progress)')
      expect(result.message).not.toContain('Task 2.2')
    })
  })
})

describe('archiveBlueprint', () => {
  let testDir: string
  let projectPath: string

  const COMPLETE_PLAN = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-02-01
created: 2026-02-01
---

# Test Plan

## Phase 1

#### Task 1.1: First Task
**Status:** done

- [x] Criteria 1
- [x] Criteria 2

#### Task 1.2: Second Task
**Status:** done

- [x] Criteria 1
`

  const INCOMPLETE_PLAN = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-02-01
created: 2026-02-01
---

# Test Plan

## Phase 1

#### Task 1.1: First Task
**Status:** in-progress

- [x] Criteria 1
- [ ] Criteria 2

#### Task 1.2: Second Task
**Status:** todo

- [ ] Criteria 1
`

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'arc-bp-'))
    projectPath = testDir
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('validation checks', () => {
    it('returns error when plan does not exist', async () => {
      const result = await archiveBlueprint('nonexistent-plan', projectPath)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Plan not found: nonexistent-plan')
    })

    it('returns error when plan is already completed', async () => {
      const result = await archiveBlueprint('completed/already-done', projectPath)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Plan is already completed')
    })

    it('returns error when tasks are incomplete without force', async () => {
      const planPath = path.join(testDir, 'webpresso/blueprints/test-plan')
      await fs.mkdir(planPath, { recursive: true })
      await fs.writeFile(path.join(planPath, '_overview.md'), INCOMPLETE_PLAN)

      const result = await archiveBlueprint('test-plan', projectPath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('incomplete')
    })
  })

  describe('successful archival', () => {
    it('archives plan with all tasks complete', async () => {
      const planPath = path.join(testDir, 'webpresso/blueprints/test-plan')
      await fs.mkdir(planPath, { recursive: true })
      await fs.writeFile(path.join(planPath, '_overview.md'), COMPLETE_PLAN)

      const result = await archiveBlueprint('test-plan', projectPath)

      expect(result.success).toBe(true)
      expect(result.newPath).toBe(path.join(testDir, 'webpresso/blueprints/test-plan'))

      // Verify status was updated in place
      const content = await fs.readFile(path.join(planPath, '_overview.md'), 'utf-8')
      expect(content).toContain('status: completed')
    })

    it('archives plan with force flag despite incomplete tasks', async () => {
      const planPath = path.join(testDir, 'webpresso/blueprints/test-plan')
      await fs.mkdir(planPath, { recursive: true })
      await fs.writeFile(path.join(planPath, '_overview.md'), INCOMPLETE_PLAN)

      const result = await archiveBlueprint('test-plan', projectPath, true)

      expect(result.success).toBe(true)
      expect(result.newPath).toBe(path.join(testDir, 'webpresso/blueprints/test-plan'))
    })

    it('handles plan slug with in-progress prefix', async () => {
      const planPath = path.join(testDir, 'webpresso/blueprints/in-progress/test-plan')
      await fs.mkdir(planPath, { recursive: true })
      await fs.writeFile(path.join(planPath, '_overview.md'), COMPLETE_PLAN)

      const result = await archiveBlueprint('in-progress/test-plan', projectPath)

      expect(result.success).toBe(true)
      expect(result.newPath).toBe(path.join(testDir, 'webpresso/blueprints/in-progress/test-plan'))
    })
  })

  describe('status update', () => {
    it('updates frontmatter status to complete', async () => {
      const planPath = path.join(testDir, 'webpresso/blueprints/test-plan')
      await fs.mkdir(planPath, { recursive: true })
      await fs.writeFile(path.join(planPath, '_overview.md'), COMPLETE_PLAN)

      await archiveBlueprint('test-plan', projectPath)

      const content = await fs.readFile(path.join(planPath, '_overview.md'), 'utf-8')
      expect(content).toContain('status: completed')
      expect(content).not.toContain('status: in-progress')
    })
  })

  describe('path handling', () => {
    it('keeps plan path stable for simple slug', async () => {
      const planPath = path.join(testDir, 'webpresso/blueprints/my-plan')
      await fs.mkdir(planPath, { recursive: true })
      await fs.writeFile(path.join(planPath, '_overview.md'), COMPLETE_PLAN)

      const result = await archiveBlueprint('my-plan', projectPath)

      expect(result.newPath).toBe(path.join(testDir, 'webpresso/blueprints/my-plan'))
    })

    it('keeps plan path stable for prefixed slug', async () => {
      const planPath = path.join(testDir, 'webpresso/blueprints/in-progress/my-plan')
      await fs.mkdir(planPath, { recursive: true })
      await fs.writeFile(path.join(planPath, '_overview.md'), COMPLETE_PLAN)

      const result = await archiveBlueprint('in-progress/my-plan', projectPath)

      expect(result.newPath).toBe(path.join(testDir, 'webpresso/blueprints/in-progress/my-plan'))
    })
  })

  describe('updateBlueprintStatus error path', () => {
    it('returns error when status update fails due to unwritable file', async () => {
      const planPath = path.join(testDir, 'webpresso/blueprints/readonly-plan')
      await fs.mkdir(planPath, { recursive: true })
      const filePath = path.join(planPath, '_overview.md')
      await fs.writeFile(filePath, COMPLETE_PLAN)

      // Activate the mock error so the next writeFile call inside archiveBlueprint
      // fails with EACCES. This works cross-module because vi.mock hoists the
      // module-level mock above, replacing the named import used by archive.ts.
      // We cannot use chmod 0o444 here because this process runs as root and root
      // bypasses filesystem permission checks.
      mockWriteFileError.active = true
      const result = await archiveBlueprint('readonly-plan', projectPath)
      mockWriteFileError.active = false

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Failed to update status/)
    })
  })

  describe('status regex replacement', () => {
    it('replaces status with multiple spaces before value', async () => {
      const planContent = `---
type: blueprint
status:   in-progress
complexity: M
last_updated: 2026-02-01
created: 2026-02-01
---

# Test Plan

## Phase 1

#### Task 1.1: First Task
**Status:** done

- [x] Criteria 1
`
      const planPath = path.join(testDir, 'webpresso/blueprints/spaces-plan')
      await fs.mkdir(planPath, { recursive: true })
      const filePath = path.join(planPath, '_overview.md')
      await fs.writeFile(filePath, planContent)

      const result = await archiveBlueprint('spaces-plan', projectPath)

      expect(result.success).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('status: completed')
      expect(content).not.toContain('status:   in-progress')
    })

    it('replaces status at line start but not inline occurrences', async () => {
      const planContent = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-02-01
created: 2026-02-01
---

# Test Plan

Some text mentioning status: draft inline.

## Phase 1

#### Task 1.1: First Task
**Status:** done

- [x] Criteria 1
`
      const planPath = path.join(testDir, 'webpresso/blueprints/inline-plan')
      await fs.mkdir(planPath, { recursive: true })
      const filePath = path.join(planPath, '_overview.md')
      await fs.writeFile(filePath, planContent)

      const result = await archiveBlueprint('inline-plan', projectPath)

      expect(result.success).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      // The frontmatter status should be replaced
      expect(content).toContain('status: completed')
      // The inline mention in body text should also be replaced since the regex
      // uses /m flag (multiline) making ^ match start of any line, but "Some text
      // mentioning status: draft inline." does not start with "status:"
      expect(content).toContain('Some text mentioning status: draft inline.')
    })

    it('replaces status with tab before value', async () => {
      // Tests that \s* in the regex matches a tab character, not just spaces
      const planContent = `---
type: blueprint
status:\tin-progress
complexity: M
last_updated: 2026-02-01
created: 2026-02-01
---

# Test Plan

## Phase 1

#### Task 1.1: First Task
**Status:** done

- [x] Criteria 1
`
      const planPath = path.join(testDir, 'webpresso/blueprints/tab-plan')
      await fs.mkdir(planPath, { recursive: true })
      const filePath = path.join(planPath, '_overview.md')
      await fs.writeFile(filePath, planContent)

      const result = await archiveBlueprint('tab-plan', projectPath)

      expect(result.success).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      // \s* matches the tab, so the entire "status:\tin-progress" should be replaced
      expect(content).toContain('status: completed')
      expect(content).not.toMatch(/status:\tin-progress/)
    })
  })
})

describe('archiveBlueprint - regex precision (kills \\S+ → \\S mutant)', () => {
  let testDir: string
  let projectPath: string

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'arc-regex-'))
    projectPath = testDir
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('replaces the full status value, not just the first character', async () => {
    const planContent = `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2026-02-01
created: 2026-02-01
---

# Test Plan

## Phase 1

#### Task 1.1: Done
**Status:** done

- [x] Criteria 1
`
    const planPath = path.join(testDir, 'webpresso/blueprints/regex-test')
    await fs.mkdir(planPath, { recursive: true })
    const filePath = path.join(planPath, '_overview.md')
    await fs.writeFile(filePath, planContent)

    await archiveBlueprint('regex-test', projectPath, true)

    const content = await fs.readFile(filePath, 'utf-8')
    // The status line must be EXACTLY "status: completed" with nothing after it
    // Mutant \S+ → \S would produce "status: completedn-progress"
    expect(content).toMatch(/^status: completed$/m)
    // No leftover from the original status value
    expect(content).not.toContain('n-progress')
    expect(content).not.toContain('in-progress')
  })

  it('replaces status with multi-word value using \\S correctly', async () => {
    // Status values are single words in YAML, but test with hyphenated value
    // to ensure the entire value is captured by \S+
    const planContent = `---
type: blueprint
status: needs-review-pending
complexity: M
last_updated: 2026-02-01
created: 2026-02-01
---

# Test Plan

## Phase 1

#### Task 1.1: Done
**Status:** done

- [x] Criteria 1
`
    const planPath = path.join(testDir, 'webpresso/blueprints/multiword-test')
    await fs.mkdir(planPath, { recursive: true })
    const filePath = path.join(planPath, '_overview.md')
    await fs.writeFile(filePath, planContent)

    await archiveBlueprint('multiword-test', projectPath, true)

    const content = await fs.readFile(filePath, 'utf-8')
    // Must replace the entire hyphenated status value
    expect(content).toMatch(/^status: completed$/m)
    expect(content).not.toContain('needs-review-pending')
    expect(content).not.toContain('eeds-review-pending')
  })
})

describe('validateAllTasksDone - mutant killing', () => {
  describe('acceptance criteria total=0 guard', () => {
    it('treats task with total=0 and checked=0 as complete when status is completed', () => {
      // This kills the mutant that changes `total > 0 && checked !== total` to `true`
      // If mutated to `true`, this task would be marked incomplete despite having
      // status=completed and no acceptance criteria (total=0, checked=0)
      const tasks = [createTask('1.1', 'No Criteria Task', 'done', 0, 0)]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(true)
      expect(result.incompleteTasks).toBe(undefined)
    })

    it('treats task with total=0 and checked=0 differently from total>0 and checked<total', () => {
      // This kills the mutant that changes `total > 0` to `total >= 0`
      // With `>= 0`, a task with total=0 and checked=0 would pass the guard
      // (0 >= 0 is true) and then check 0 !== 0 (false), so no difference.
      // Actually >= wouldn't change behavior for 0,0. Let's test a case that
      // distinguishes > from >=.
      //
      // Plan A: completed task with total=0, checked=0 should be valid
      const planA = createPlan([createTask('1.1', 'Task A', 'done', 0, 0)])
      const resultA = validateAllTasksDone(planA)
      expect(resultA.valid).toBe(true)

      // Plan B: completed task with total=3, checked=2 should be invalid
      const planB = createPlan([createTask('1.1', 'Task B', 'done', 3, 2)])
      const resultB = validateAllTasksDone(planB)
      expect(resultB.valid).toBe(false)
      expect(resultB.incompleteTasks).toHaveLength(1)
      expect(resultB.incompleteTasks![0]!.id).toBe('1.1')
    })

    it('valid plan returns exactly valid:true with no other fields', () => {
      // This kills mutant on line 242: `if (!result.valid)` → `true`
      // If mutated to `true`, validatePlanTasks would always return the message,
      // and archiveBlueprint would always fail validation.
      // We verify that a valid plan produces exactly {valid: true} with no extras.
      const tasks = [createTask('1.1', 'Done Task', 'done', 2, 2)]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result).toStrictEqual({ valid: true })
    })

    it('invalid plan returns valid:false with incompleteTasks and message', () => {
      // Counterpart: an invalid plan must have valid=false, incompleteTasks array,
      // and a non-empty message string
      const tasks = [createTask('1.1', 'Undone Task', 'todo', 1, 0)]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toHaveLength(1)
      expect(result.incompleteTasks![0]!.id).toBe('1.1')
      expect(result.incompleteTasks![0]!.status).toBe('todo')
      expect(result.message).toBe('1 task incomplete: Task 1.1 (todo)')
    })
  })

  describe('mixed total=0 and total>0 acceptance criteria', () => {
    it('all completed tasks pass even with mix of 0-criteria and checked-criteria', () => {
      const tasks = [
        createTask('1.1', 'No criteria', 'done', 0, 0),
        createTask('1.2', 'Has criteria all checked', 'done', 5, 5),
        createTask('2.1', 'Also no criteria', 'done', 0, 0),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(true)
    })

    it('fails when one task has total>0 but checked<total among zero-criteria tasks', () => {
      const tasks = [
        createTask('1.1', 'No criteria', 'done', 0, 0),
        createTask('1.2', 'Partially checked', 'done', 3, 1),
        createTask('2.1', 'Also no criteria', 'done', 0, 0),
      ]
      const plan = createPlan(tasks)

      const result = validateAllTasksDone(plan)

      expect(result.valid).toBe(false)
      expect(result.incompleteTasks).toHaveLength(1)
      expect(result.incompleteTasks![0]!.id).toBe('1.2')
    })
  })
})
