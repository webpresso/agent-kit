import { describe, expect, it } from 'vitest'

import type { Evidence } from '#evidence.js'

import { applyBlueprintLifecycle } from './engine.js'

const PASSING_EVIDENCE = [
  {
    kind: 'test',
    result: 'pass',
    command: 'wp_test --files src/blueprint/lifecycle/engine.test.ts',
    exit_code: 0,
    ts: '2026-05-28T12:00:00.000Z',
  },
] satisfies readonly Evidence[]

const ZERO_TASK_BLUEPRINT = `---
type: blueprint
status: planned
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-05-01'
---

# Zero Task Blueprint

## Product wedge anchor

- **Stage outcome:** Phase 1 — prove lifecycle behavior
- **Consuming surface:** /lifecycle route
- **New user-visible capability:** Users can finalize blueprints safely.

## Summary

Blueprint used to test zero-task finalize rejection.
`

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

function verifyTask(markdown: string, taskId: string) {
  return applyBlueprintLifecycle(markdown, 'planned/sample-blueprint', {
    type: 'task_verify',
    taskId,
    evidence: PASSING_EVIDENCE,
  })
}

function verifiedBlueprint(): string {
  const first = verifyTask(BASE_BLUEPRINT, '1.1')
  const second = verifyTask(first.markdown, '1.2')
  return second.markdown
}

describe('applyBlueprintLifecycle', () => {
  it('starts a blueprint and generates progress metadata', () => {
    const result = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'start',
    })

    expect(result.targetStatus).toBe('in-progress')
    expect(result.markdown).toContain('status: in-progress')
    expect(result.markdown).toContain('progress:')
  })

  it('records path-free owner binding metadata when starting a blueprint', () => {
    const result = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'start',
      worktreeOwnerId: 'owner-123',
      worktreeOwnerBranch: 'bp/sample-blueprint',
    })

    expect(result.markdown).toContain('worktree_owner_id: owner-123')
    expect(result.markdown).toContain('worktree_owner_branch: bp/sample-blueprint')
    expect(result.markdown).not.toContain('worktree_owner_path')
  })

  it('parks a blueprint and updates frontmatter', () => {
    const result = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'park',
    })

    expect(result.targetStatus).toBe('parked')
    expect(result.markdown).toContain('status: parked')
    expect(result.markdown).toContain('progress:')
  })

  it('clears owner binding metadata when parking a blueprint', () => {
    const started = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'start',
      worktreeOwnerId: 'owner-123',
      worktreeOwnerBranch: 'bp/sample-blueprint',
    })

    const parked = applyBlueprintLifecycle(started.markdown, 'in-progress/sample-blueprint', {
      type: 'park',
    })

    expect(parked.markdown).not.toContain('worktree_owner_id')
    expect(parked.markdown).not.toContain('worktree_owner_branch')
  })

  it('writes explicit task status and block reason', () => {
    const started = applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
      type: 'task_start',
      taskId: '1.1',
    })
    expect(started.markdown).toContain('**Status:** in-progress')

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
    expect(startedTask.markdown).toContain('**Status:** in-progress')
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

  it('refuses raw task_complete without evidence', () => {
    expect(() =>
      applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
        type: 'task_complete',
        taskId: '1.1',
      }),
    ).toThrow(/cannot be completed without evidence/)
  })

  it('verifies a task by marking status done, checking acceptance boxes, and writing evidence', () => {
    const result = verifyTask(BASE_BLUEPRINT, '1.1')

    expect(result.markdown).toContain('**Status:** done')
    expect(result.markdown).toContain('- [x] Criterion A')
    expect(result.markdown).toContain('- [x] Criterion B')
    expect(result.markdown).toContain('```webpresso-evidence-v1')
  })

  it('finalizes only when every task is verified with task-local evidence', () => {
    const finalized = applyBlueprintLifecycle(verifiedBlueprint(), 'planned/sample-blueprint', {
      type: 'finalize',
    })

    expect(finalized.targetStatus).toBe('completed')
    expect(finalized.markdown).toContain('status: completed')
    expect(finalized.markdown).toContain('completed_at:')
  })

  it('rejects finalize for a zero-task blueprint', () => {
    expect(() =>
      applyBlueprintLifecycle(ZERO_TASK_BLUEPRINT, 'planned/zero-task-blueprint', {
        type: 'finalize',
      }),
    ).toThrow(/zero-task|0 tasks|no tasks/i)
  })

  it('rejects finalize when done tasks lack task-local evidence', () => {
    const rawDone = BASE_BLUEPRINT.replaceAll('**Status:** todo', '**Status:** done').replaceAll(
      '- [ ]',
      '- [x]',
    )

    expect(() =>
      applyBlueprintLifecycle(rawDone, 'planned/sample-blueprint', {
        type: 'finalize',
      }),
    ).toThrow(/missing task-local canonical verification evidence/)
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

  it('rejects start, park, and task operations on completed blueprints', () => {
    const finalized = applyBlueprintLifecycle(verifiedBlueprint(), 'planned/sample-blueprint', {
      type: 'finalize',
    })

    expect(() =>
      applyBlueprintLifecycle(finalized.markdown, 'completed/sample-blueprint', {
        type: 'start',
      }),
    ).toThrow('already completed')
    expect(() =>
      applyBlueprintLifecycle(finalized.markdown, 'completed/sample-blueprint', {
        type: 'park',
      }),
    ).toThrow('already completed')
    expect(() =>
      applyBlueprintLifecycle(finalized.markdown, 'completed/sample-blueprint', {
        type: 'task_start',
        taskId: '1.1',
      }),
    ).toThrow('already completed')
  })

  it('rejects task_start and task_block on an already done task', () => {
    const completed = verifyTask(BASE_BLUEPRINT, '1.1')

    expect(() =>
      applyBlueprintLifecycle(completed.markdown, 'planned/sample-blueprint', {
        type: 'task_start',
        taskId: '1.1',
      }),
    ).toThrow('already done')
    expect(() =>
      applyBlueprintLifecycle(completed.markdown, 'planned/sample-blueprint', {
        type: 'task_block',
        taskId: '1.1',
        reason: 'Cannot block done task',
      }),
    ).toThrow('already done')
  })

  it('rejects block with empty reason', () => {
    expect(() =>
      applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
        type: 'task_block',
        taskId: '1.1',
        reason: '   ',
      }),
    ).toThrow('requires a non-empty block reason')
  })

  it('keeps in-progress status when task action on draft', () => {
    const blueprint = `---
type: blueprint
status: draft
complexity: S
last_updated: 2026-04-02
created: 2026-04-02
---
# sample-blueprint

#### Task 1.1: First
**Status:** todo
**Depends:** None
`
    const result = applyBlueprintLifecycle(blueprint, 'draft/sample-blueprint', {
      type: 'task_start',
      taskId: '1.1',
    })

    expect(result.targetStatus).toBe('in-progress')
    expect(result.markdown).toContain('status: in-progress')
  })

  it('rejects unblock on non-blocked task without blockedReason', () => {
    expect(() =>
      applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
        type: 'task_unblock',
        taskId: '1.1',
      }),
    ).toThrow('is not blocked')
  })

  it('rejects task_start on nonexistent taskId', () => {
    expect(() =>
      applyBlueprintLifecycle(BASE_BLUEPRINT, 'planned/sample-blueprint', {
        type: 'task_start',
        taskId: '9.9',
      }),
    ).toThrow('not found')
  })

  it('keeps completed status when finalizing already completed', () => {
    const finalized = applyBlueprintLifecycle(verifiedBlueprint(), 'planned/sample-blueprint', {
      type: 'finalize',
    })

    const doubleFinalized = applyBlueprintLifecycle(
      finalized.markdown,
      'completed/sample-blueprint',
      { type: 'finalize' },
    )
    expect(doubleFinalized.targetStatus).toBe('completed')
  })
})
