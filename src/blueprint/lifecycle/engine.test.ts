import { describe, expect, it } from 'vitest'

import { applyBlueprintLifecycle } from './engine.js'

const BASE_BLUEPRINT = `---
type: blueprint
status: planned
complexity: S
last_updated: 2026-04-02
created: 2026-04-02
---

# sample-blueprint

## Implementation

#### Task 1.1: First task
**Status:** todo

**Acceptance:**
- [ ] Criterion A
- [ ] Criterion B

#### Task 1.2: Second task

**Status:** todo

**Acceptance:**
- [ ] Criterion A
`

describe('applyBlueprintLifecycle', () => {
  it('starts a blueprint and generates progress metadata', () => {
    const result = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'start',
    })

    expect(result.targetStatus).toBe('in-progress')
    expect(result.markdown).toContain('status: in-progress')
    expect(result.markdown).toContain('progress:')
  })

  it('parks a blueprint and updates frontmatter', () => {
    const result = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'park',
    })

    expect(result.targetStatus).toBe('parked')
    expect(result.markdown).toContain('status: parked')
    expect(result.markdown).toContain('progress:')
  })

  it('writes explicit task status and block reason', () => {
    const started = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'task_start',
      taskId: '1.1',
    })
    expect(started.markdown).toContain('**Status:** in_progress')

    const blocked = applyBlueprintLifecycle(started.markdown, 'planned/sample-blueprint', {
      type: 'task_block',
      taskId: '1.1',
      reason: 'Waiting on API approval',
    })
    expect(blocked.targetStatus).toBe('in-progress')
    expect(blocked.markdown).toContain('**Status:** blocked')
    expect(blocked.markdown).toContain('**Blocked:** Waiting on API approval')
  })

  it('moves task updates from parked blueprints back into in-progress', () => {
    const parked = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'park',
    })

    const startedTask = applyBlueprintLifecycle(parked.markdown, 'parked/sample-blueprint', {
      type: 'task_start',
      taskId: '1.1',
    })

    expect(startedTask.targetStatus).toBe('in-progress')
    expect(startedTask.markdown).toContain('status: in-progress')
    expect(startedTask.markdown).toContain('**Status:** in_progress')
  })

  it('unblocks tasks back to todo and clears blocked reason', () => {
    const blocked = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'task_block',
      taskId: '1.1',
      reason: 'Waiting on API approval',
    })

    const unblocked = applyBlueprintLifecycle(blocked.markdown, 'planned/sample-blueprint', {
      type: 'task_unblock',
      taskId: '1.1',
    })

    expect(unblocked.markdown).toContain('**Status:** todo')
    expect(unblocked.markdown).not.toContain('**Blocked:** Waiting on API approval')
  })

  it('completes a task by marking status done and checking acceptance boxes', () => {
    const result = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'task_complete',
      taskId: '1.1',
    })

    expect(result.markdown).toContain('**Status:** done')
    expect(result.markdown).toContain('- [x] Criterion A')
    expect(result.markdown).toContain('- [x] Criterion B')
  })

  it('finalizes only when every task is done', () => {
    const completedFirst = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'task_complete',
      taskId: '1.1',
    })
    const completedSecond = applyBlueprintLifecycle(
      completedFirst.markdown,
      'planned/sample-blueprint',
      {
        type: 'task_complete',
        taskId: '1.2',
      },
    )

    const finalized = applyBlueprintLifecycle(
      completedSecond.markdown,
      'planned/sample-blueprint',
      {
        type: 'finalize',
      },
    )

    expect(finalized.targetStatus).toBe('completed')
    expect(finalized.markdown).toContain('status: completed')
    expect(finalized.markdown).toContain('completed_at:')
  })

  it('rejects finalize when incomplete tasks remain', () => {
    expect(() =>
      applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
        type: 'finalize',
      }),
    ).toThrow('cannot finalize')
  })

  it('rejects finalize when a task is blocked', () => {
    const blocked = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'task_block',
      taskId: '1.1',
      reason: 'Waiting on dependency',
    })
    expect(() =>
      applyBlueprintLifecycle(blocked.markdown, 'planned/sample-blueprint', { type: 'finalize' }),
    ).toThrow('cannot finalize')
  })
})
