import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openDb } from '#db/connection.js'
import { ingestBlueprints } from '#db/ingester.js'

import { advanceTask, finalizeBlueprint, promoteBlueprint } from './mutations.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OVERVIEW_WITH_TASKS = `---
type: blueprint
status: planned
complexity: S
owner: alice
created: '2026-01-01'
last_updated: '2026-01-01'
tags: []
depends_on: []
---

# Test Blueprint

## Summary

A test blueprint for mutation verbs.

## Tasks

#### Task 1.1: First task
**Status:** todo
- [ ] Do the first thing

#### Task 1.2: Second task
**Status:** todo
- [ ] Do the second thing
`

const OVERVIEW_ALL_DONE = `---
type: blueprint
status: in-progress
complexity: S
owner: alice
created: '2026-01-01'
last_updated: '2026-01-01'
tags: []
depends_on: []
---

# Completable Blueprint

## Summary

A blueprint with all tasks done.

## Tasks

#### Task 1.1: First task
**Status:** done
- [x] Did it

#### Task 1.2: Second task
**Status:** done
- [x] Did that too
`

const OVERVIEW_MIXED_STATUS = `---
type: blueprint
status: in-progress
complexity: S
owner: alice
created: '2026-01-01'
last_updated: '2026-01-01'
tags: []
depends_on: []
---

# Blocked Blueprint

## Summary

A blueprint with one incomplete task.

## Tasks

#### Task 1.1: First task
**Status:** done
- [x] Done

#### Task 1.2: Incomplete task
**Status:** in-progress
- [ ] Still going
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(blueprintSlug: string, content: string, state = 'planned'): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ak-mutations-test-'))
  mkdirSync(path.join(dir, 'blueprints', state, blueprintSlug), { recursive: true })
  writeFileSync(
    path.join(dir, 'blueprints', state, blueprintSlug, '_overview.md'),
    content,
    'utf8',
  )
  // Minimal package.json so resolveBlueprintRoot works
  writeFileSync(path.join(dir, 'package.json'), '{"name":"test-consumer"}', 'utf8')
  return dir
}

async function seedDb(repoDir: string): Promise<void> {
  const agentDir = path.join(repoDir, '.agent')
  mkdirSync(agentDir, { recursive: true })
  const dbFilePath = path.join(agentDir, '.blueprints.db')
  const conn = openDb(dbFilePath)
  try {
    await ingestBlueprints({ db: conn.db, cwd: repoDir })
  } finally {
    conn.close()
  }
}

function readOverview(repoDir: string, slug: string, state: string): string {
  return readFileSync(
    path.join(repoDir, 'blueprints', state, slug, '_overview.md'),
    'utf8',
  )
}

function queryTaskStatus(repoDir: string, blueprintSlug: string, taskId: string): string | null {
  const dbFilePath = path.join(repoDir, '.agent', '.blueprints.db')
  const conn = openDb(dbFilePath)
  try {
    const row = conn.db
      .prepare<[string, string], { status: string }>(
        'SELECT status FROM tasks WHERE blueprint_slug = ? AND task_id = ?',
      )
      .get(blueprintSlug, taskId) as { status: string } | undefined
    return row?.status ?? null
  } finally {
    conn.close()
  }
}

function queryBlueprintStatus(repoDir: string, slug: string): string | null {
  const dbFilePath = path.join(repoDir, '.agent', '.blueprints.db')
  const conn = openDb(dbFilePath)
  try {
    const row = conn.db
      .prepare<[string], { status: string }>(
        'SELECT status FROM blueprints WHERE slug = ?',
      )
      .get(slug) as { status: string } | undefined
    return row?.status ?? null
  } finally {
    conn.close()
  }
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let tmpRepoDir: string

afterEach(() => {
  rmSync(tmpRepoDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// advanceTask
// ---------------------------------------------------------------------------

describe('advanceTask', () => {
  beforeEach(async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
    await seedDb(tmpRepoDir)
  })

  it('updates the correct Status line in markdown', async () => {
    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'in-progress')

    const content = readOverview(tmpRepoDir, 'my-feature', 'planned')
    expect(content).toContain('**Status:** in-progress')
    // Task 1.2 must not be touched
    const lines = content.split('\n')
    const task12Idx = lines.findIndex((l) => l.includes('Task 1.2:'))
    const statusAfter12 = lines.slice(task12Idx + 1).find((l) => l.startsWith('**Status:**'))
    expect(statusAfter12).toBe('**Status:** todo')
  })

  it('updates the status field to the new value', async () => {
    const result = await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'done')
    expect(result.oldStatus).toBe('todo')
    expect(result.newStatus).toBe('done')
  })

  it('is idempotent — already same status returns a message and exits cleanly', async () => {
    const result = await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'todo')
    expect(result.message).toMatch(/already todo/)
    expect(result.oldStatus).toBe('todo')
    expect(result.newStatus).toBe('todo')
  })

  it('does not modify the file when already at the target status', async () => {
    const before = readOverview(tmpRepoDir, 'my-feature', 'planned')
    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'todo')
    const after = readOverview(tmpRepoDir, 'my-feature', 'planned')
    expect(after).toBe(before)
  })

  it('re-ingests after change — DB row is updated', async () => {
    // Verify initial state
    const beforeStatus = queryTaskStatus(tmpRepoDir, 'my-feature', '1.1')
    expect(beforeStatus).toBe('todo')

    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'in-progress')

    const afterStatus = queryTaskStatus(tmpRepoDir, 'my-feature', '1.1')
    expect(afterStatus).toBe('in-progress')
  })

  it('advances to blocked status', async () => {
    const result = await advanceTask(tmpRepoDir, 'my-feature', '1.2', 'blocked')
    expect(result.newStatus).toBe('blocked')
    const content = readOverview(tmpRepoDir, 'my-feature', 'planned')
    // Task 1.2's status line should be updated
    const lines = content.split('\n')
    const task12Idx = lines.findIndex((l) => l.includes('Task 1.2:'))
    const statusLine = lines.slice(task12Idx + 1).find((l) => l.startsWith('**Status:**'))
    expect(statusLine).toBe('**Status:** blocked')
  })

  it('throws when blueprint slug is not found', async () => {
    await expect(advanceTask(tmpRepoDir, 'nonexistent-slug', '1.1', 'done')).rejects.toThrow(
      'not found',
    )
  })

  it('throws when task ID is not found in the blueprint', async () => {
    await expect(advanceTask(tmpRepoDir, 'my-feature', '99.99', 'done')).rejects.toThrow(
      'Task "99.99" not found',
    )
  })
})

// ---------------------------------------------------------------------------
// promoteBlueprint
// ---------------------------------------------------------------------------

describe('promoteBlueprint', () => {
  it('moves directory to the target state folder and updates frontmatter', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
    await seedDb(tmpRepoDir)

    const result = await promoteBlueprint(tmpRepoDir, 'my-feature', 'in-progress')

    expect(result.oldState).toBe('planned')
    expect(result.newState).toBe('in-progress')
    expect(result.newPath).toContain(path.join('in-progress', 'my-feature', '_overview.md'))

    const content = readFileSync(result.newPath, 'utf8')
    expect(content).toContain('status: in-progress')
  })

  it('re-ingests DB after move — blueprint status is updated', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
    await seedDb(tmpRepoDir)

    const beforeStatus = queryBlueprintStatus(tmpRepoDir, 'my-feature')
    expect(beforeStatus).toBe('planned')

    await promoteBlueprint(tmpRepoDir, 'my-feature', 'in-progress')

    const afterStatus = queryBlueprintStatus(tmpRepoDir, 'my-feature')
    expect(afterStatus).toBe('in-progress')
  })

  it('sets completed_at when promoting to completed', async () => {
    tmpRepoDir = makeRepo('completable', OVERVIEW_ALL_DONE, 'in-progress')
    await seedDb(tmpRepoDir)

    const result = await promoteBlueprint(tmpRepoDir, 'completable', 'completed')
    const content = readFileSync(result.newPath, 'utf8')
    expect(content).toMatch(/completed_at:\s*'\d{4}-\d{2}-\d{2}'/)
  })

  it('refuses to complete when tasks are not done', async () => {
    tmpRepoDir = makeRepo('my-blocked', OVERVIEW_MIXED_STATUS, 'in-progress')
    await seedDb(tmpRepoDir)

    await expect(promoteBlueprint(tmpRepoDir, 'my-blocked', 'completed')).rejects.toThrow(
      /tasks are not done/,
    )
  })

  it('lists the blocking task IDs in the refusal message', async () => {
    tmpRepoDir = makeRepo('my-blocked', OVERVIEW_MIXED_STATUS, 'in-progress')
    await seedDb(tmpRepoDir)

    await expect(promoteBlueprint(tmpRepoDir, 'my-blocked', 'completed')).rejects.toThrow('1.2')
  })

  it('throws when blueprint slug is not found', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
    await expect(promoteBlueprint(tmpRepoDir, 'nonexistent', 'in-progress')).rejects.toThrow(
      'not found',
    )
  })

  it('can park a blueprint', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
    await seedDb(tmpRepoDir)

    const result = await promoteBlueprint(tmpRepoDir, 'my-feature', 'parked')
    expect(result.newState).toBe('parked')
    expect(result.newPath).toContain(path.join('parked', 'my-feature'))
  })
})

// ---------------------------------------------------------------------------
// finalizeBlueprint (thin wrapper)
// ---------------------------------------------------------------------------

describe('finalizeBlueprint', () => {
  it('is equivalent to promoteBlueprint to completed', async () => {
    tmpRepoDir = makeRepo('completable', OVERVIEW_ALL_DONE, 'in-progress')
    await seedDb(tmpRepoDir)

    const result = await finalizeBlueprint(tmpRepoDir, 'completable')
    expect(result.newState).toBe('completed')
    expect(result.newPath).toContain(path.join('completed', 'completable'))
  })

  it('refuses when tasks are not done', async () => {
    tmpRepoDir = makeRepo('my-blocked', OVERVIEW_MIXED_STATUS, 'in-progress')
    await seedDb(tmpRepoDir)

    await expect(finalizeBlueprint(tmpRepoDir, 'my-blocked')).rejects.toThrow(/tasks are not done/)
  })
})

// ---------------------------------------------------------------------------
// Atomic write guarantee
// ---------------------------------------------------------------------------

describe('atomic write', () => {
  it('original file is unchanged if an error occurs before write completes', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
    await seedDb(tmpRepoDir)

    const originalContent = readOverview(tmpRepoDir, 'my-feature', 'planned')

    // A known-bad task ID should throw before writing anything
    await expect(advanceTask(tmpRepoDir, 'my-feature', '0.0', 'done')).rejects.toThrow()

    const contentAfter = readOverview(tmpRepoDir, 'my-feature', 'planned')
    expect(contentAfter).toBe(originalContent)
  })
})
