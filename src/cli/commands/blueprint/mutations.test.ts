import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openDb } from '#db/connection.js'
import { ingestBlueprints } from '#db/ingester.js'
import { resolveBlueprintProjectionDbPath } from '#db/paths.js'

import {
  _setSyncAdapterForCli,
  advanceTask,
  finalizeBlueprint,
  promoteBlueprint,
  type SyncAdapter,
} from './mutations.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TASK_VERIFICATION_BLOCK = `**Verification:**

\`\`\`webpresso-evidence-v1
[{"command":"wp_test --files src/cli/commands/blueprint/mutations.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T12:00:00.000Z"}]
\`\`\``

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
${TASK_VERIFICATION_BLOCK}
- [x] Did it

#### Task 1.2: Second task
**Status:** done
${TASK_VERIFICATION_BLOCK}
- [x] Did that too
`

const OVERVIEW_ZERO_TASK = `---
type: blueprint
status: planned
complexity: S
owner: alice
created: '2026-01-01'
last_updated: '2026-01-01'
tags: []
depends_on: []
---

# Zero Task Blueprint

## Summary

A blueprint with no tasks.
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
${TASK_VERIFICATION_BLOCK}
- [x] Done

#### Task 1.2: Incomplete task
**Status:** in-progress
- [ ] Still going
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(blueprintSlug: string, content: string, state = 'planned'): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-mutations-test-'))
  mkdirSync(path.join(dir, 'blueprints', state, blueprintSlug), { recursive: true })
  writeFileSync(path.join(dir, 'blueprints', state, blueprintSlug, '_overview.md'), content, 'utf8')
  // Minimal package.json so resolveBlueprintRoot works
  writeFileSync(path.join(dir, 'package.json'), '{"name":"test-consumer"}', 'utf8')
  return dir
}

function makeFlatRepo(blueprintSlug: string, content: string, state = 'planned'): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-mutations-flat-test-'))
  mkdirSync(path.join(dir, 'blueprints', state), { recursive: true })
  writeFileSync(path.join(dir, 'blueprints', state, `${blueprintSlug}.md`), content, 'utf8')
  writeFileSync(path.join(dir, 'package.json'), '{"name":"test-consumer"}', 'utf8')
  return dir
}

async function seedDb(repoDir: string): Promise<void> {
  const dbFilePath = resolveBlueprintProjectionDbPath(repoDir)
  mkdirSync(path.dirname(dbFilePath), { recursive: true })
  const conn = openDb(dbFilePath)
  try {
    await ingestBlueprints({ db: conn.db, cwd: repoDir })
  } finally {
    conn.close()
  }
}

function readOverview(repoDir: string, slug: string, state: string): string {
  return readFileSync(path.join(repoDir, 'blueprints', state, slug, '_overview.md'), 'utf8')
}

function queryTaskStatus(repoDir: string, blueprintSlug: string, taskId: string): string | null {
  const dbFilePath = resolveBlueprintProjectionDbPath(repoDir)
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
  const dbFilePath = resolveBlueprintProjectionDbPath(repoDir)
  const conn = openDb(dbFilePath)
  try {
    const row = conn.db
      .prepare<[string], { status: string }>('SELECT status FROM blueprints WHERE slug = ?')
      .get(slug) as { status: string } | undefined
    return row?.status ?? null
  } finally {
    conn.close()
  }
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let tmpRepoDir = ''

afterEach(() => {
  if (tmpRepoDir !== '') {
    rmSync(tmpRepoDir, { recursive: true, force: true })
    tmpRepoDir = ''
  }
})

// ---------------------------------------------------------------------------
// advanceTask
// ---------------------------------------------------------------------------

describe('advanceTask', () => {
  beforeEach(() => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
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

  it('refuses to advance directly to done without evidence', async () => {
    await expect(advanceTask(tmpRepoDir, 'my-feature', '1.1', 'done')).rejects.toThrow(
      /wp_blueprint_task_verify/,
    )
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
    await seedDb(tmpRepoDir)

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

  it('refuses to complete a zero-task blueprint through promote', async () => {
    tmpRepoDir = makeRepo('zero-task', OVERVIEW_ZERO_TASK, 'planned')

    await expect(promoteBlueprint(tmpRepoDir, 'zero-task', 'completed')).rejects.toThrow(
      /zero-task|0 tasks|no tasks/i,
    )
  })

  it('refuses to complete a zero-task blueprint through finalize', async () => {
    tmpRepoDir = makeRepo(
      'zero-task-finalize',
      OVERVIEW_ZERO_TASK.replace('status: planned', 'status: in-progress'),
      'in-progress',
    )

    await expect(finalizeBlueprint(tmpRepoDir, 'zero-task-finalize')).rejects.toThrow(
      /zero-task|0 tasks|no tasks/i,
    )
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

    const result = await promoteBlueprint(tmpRepoDir, 'completable', 'completed')
    const content = readFileSync(result.newPath, 'utf8')
    expect(content).toMatch(/completed_at:\s*'\d{4}-\d{2}-\d{2}'/)
  })

  it('refuses to complete when tasks are not done', async () => {
    tmpRepoDir = makeRepo('my-blocked', OVERVIEW_MIXED_STATUS, 'in-progress')

    await expect(promoteBlueprint(tmpRepoDir, 'my-blocked', 'completed')).rejects.toThrow(
      /tasks are not done/,
    )
  })

  it('lists the blocking task IDs in the refusal message', async () => {
    tmpRepoDir = makeRepo('my-blocked', OVERVIEW_MIXED_STATUS, 'in-progress')

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

    const result = await finalizeBlueprint(tmpRepoDir, 'completable')
    expect(result.newState).toBe('completed')
    expect(result.newPath).toContain(path.join('completed', 'completable'))
  })

  it('finalizes flat-file blueprints through the same mutation path', async () => {
    tmpRepoDir = makeFlatRepo('flat-completable', OVERVIEW_ALL_DONE, 'in-progress')

    const result = await finalizeBlueprint(tmpRepoDir, 'flat-completable')

    expect(result.newState).toBe('completed')
    expect(result.newPath).toContain(path.join('completed', 'flat-completable.md'))
    expect(() =>
      readFileSync(path.join(tmpRepoDir, 'blueprints', 'completed', 'flat-completable.md'), 'utf8'),
    ).not.toThrow()
  })

  it('refuses when tasks are not done', async () => {
    tmpRepoDir = makeRepo('my-blocked', OVERVIEW_MIXED_STATUS, 'in-progress')

    await expect(finalizeBlueprint(tmpRepoDir, 'my-blocked')).rejects.toThrow(/tasks are not done/)
  })
})

// ---------------------------------------------------------------------------
// Atomic write guarantee
// ---------------------------------------------------------------------------

describe('atomic write', () => {
  it('original file is unchanged if an error occurs before write completes', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')

    const originalContent = readOverview(tmpRepoDir, 'my-feature', 'planned')

    // A known-bad task ID should throw before writing anything
    await expect(advanceTask(tmpRepoDir, 'my-feature', '0.0', 'done')).rejects.toThrow()

    const contentAfter = readOverview(tmpRepoDir, 'my-feature', 'planned')
    expect(contentAfter).toBe(originalContent)
  })
})

// ---------------------------------------------------------------------------
// Platform-first sync — advanceTask (Task 2.7)
// ---------------------------------------------------------------------------

function makeMockAdapter(): {
  adapter: SyncAdapter
  pushEvent: ReturnType<typeof vi.fn>
  ensureFresh: ReturnType<typeof vi.fn>
} {
  const pushEvent = vi.fn<SyncAdapter['pushEvent']>().mockResolvedValue(undefined)
  const ensureFresh = vi.fn<SyncAdapter['ensureFresh']>().mockResolvedValue(undefined)
  const adapter: SyncAdapter = { pushEvent, ensureFresh }
  return { adapter, pushEvent, ensureFresh }
}

describe('advanceTask — platform-first sync', () => {
  beforeEach(() => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
  })

  afterEach(() => {
    _setSyncAdapterForCli(null)
    vi.unstubAllEnvs()
  })

  it('calls pushEvent with task.status_changed and ensureFresh when adapter is available', async () => {
    const { adapter, pushEvent, ensureFresh } = makeMockAdapter()
    _setSyncAdapterForCli(() => adapter)

    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'in-progress')

    expect(pushEvent).toHaveBeenCalledOnce()
    const call = pushEvent.mock.calls[0]?.[0]
    expect(call).toStrictEqual(
      expect.objectContaining({
        type: 'task.status_changed',
        payload: expect.objectContaining({
          type: 'task.status_changed',
          blueprintSlug: 'my-feature',
          taskId: '1.1',
          fromStatus: 'todo',
          toStatus: 'in-progress',
        }),
      }),
    )
    expect(ensureFresh).toHaveBeenCalledOnce()
    expect(ensureFresh).toHaveBeenCalledWith({ slug: 'my-feature' })
  })

  it('still updates markdown when adapter is available', async () => {
    const { adapter } = makeMockAdapter()
    _setSyncAdapterForCli(() => adapter)

    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'in-progress')

    const content = readOverview(tmpRepoDir, 'my-feature', 'planned')
    expect(content).toContain('**Status:** in-progress')
  })

  it('does not call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')
    const { adapter, pushEvent } = makeMockAdapter()
    _setSyncAdapterForCli(() => adapter)

    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'in-progress')

    expect(pushEvent).not.toHaveBeenCalled()
  })

  it('disabled path produces byte-identical output to pre-migration — markdown unchanged', async () => {
    const before = readOverview(tmpRepoDir, 'my-feature', 'planned')

    // With disabled flag, markdown-canonical path runs
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')
    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'in-progress')

    const afterDisabled = readOverview(tmpRepoDir, 'my-feature', 'planned')
    expect(afterDisabled).toContain('**Status:** in-progress')

    // Reset and run without adapter at all — same result expected
    const tmpRepoDir2 = makeRepo('my-feature', before, 'planned')
    vi.unstubAllEnvs()
    _setSyncAdapterForCli(() => null)

    try {
      await advanceTask(tmpRepoDir2, 'my-feature', '1.1', 'in-progress')
      const afterNullAdapter = readOverview(tmpRepoDir2, 'my-feature', 'planned')
      expect(afterDisabled).toStrictEqual(afterNullAdapter)
    } finally {
      rmSync(tmpRepoDir2, { recursive: true, force: true })
    }
  })

  it('does not call pushEvent when already at target status (idempotent path)', async () => {
    const { adapter, pushEvent } = makeMockAdapter()
    _setSyncAdapterForCli(() => adapter)

    // Task 1.1 is already 'todo' — idempotent path, should not push event
    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'todo')

    expect(pushEvent).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// resolveSyncAdapterForCli — production default path
// ---------------------------------------------------------------------------

describe('resolveSyncAdapterForCli — production default path', () => {
  beforeEach(() => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
  })

  afterEach(() => {
    _setSyncAdapterForCli(null) // restore default (null factory = production path)
    vi.unstubAllEnvs()
  })

  it('returns null when no factory is injected and WP_BLUEPRINT_PLATFORM_TOKEN is absent', async () => {
    // Do NOT call _setSyncAdapterForCli — let it use the production default
    // hermetic-env.ts already deletes WP_BLUEPRINT_PLATFORM_DISABLED before each test;
    // WP_BLUEPRINT_PLATFORM_TOKEN is not in the hermetic set so ensure it's absent here.
    delete process.env['WP_BLUEPRINT_PLATFORM_TOKEN']

    // advanceTask with production path → no token → adapter null → markdown-canonical
    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'in-progress')

    const content = readOverview(tmpRepoDir, 'my-feature', 'planned')
    expect(content).toContain('**Status:** in-progress')
  })

  it('returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1 even if token is present', async () => {
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_TOKEN', 'some-token')
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')

    await advanceTask(tmpRepoDir, 'my-feature', '1.1', 'blocked')

    const content = readOverview(tmpRepoDir, 'my-feature', 'planned')
    expect(content).toContain('**Status:** blocked')
  })
})

// ---------------------------------------------------------------------------
// Platform-first sync — promoteBlueprint (Task 2.6)
// ---------------------------------------------------------------------------

describe('promoteBlueprint — platform-first sync', () => {
  afterEach(() => {
    _setSyncAdapterForCli(null)
    vi.unstubAllEnvs()
  })

  it('calls pushEvent with blueprint.status_changed and ensureFresh when adapter is available', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')

    const { adapter, pushEvent, ensureFresh } = makeMockAdapter()
    _setSyncAdapterForCli(() => adapter)

    await promoteBlueprint(tmpRepoDir, 'my-feature', 'in-progress')

    expect(pushEvent).toHaveBeenCalledOnce()
    const call = pushEvent.mock.calls[0]?.[0]
    expect(call).toStrictEqual(
      expect.objectContaining({
        type: 'blueprint.status_changed',
        payload: expect.objectContaining({
          type: 'blueprint.status_changed',
          slug: 'my-feature',
          fromStatus: 'planned',
          toStatus: 'in-progress',
        }),
      }),
    )
    expect(ensureFresh).toHaveBeenCalledOnce()
    expect(ensureFresh).toHaveBeenCalledWith({ slug: 'my-feature' })
  })

  it('still moves the directory and updates frontmatter when adapter is available', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')

    const { adapter } = makeMockAdapter()
    _setSyncAdapterForCli(() => adapter)

    const result = await promoteBlueprint(tmpRepoDir, 'my-feature', 'in-progress')

    expect(result.newState).toBe('in-progress')
    const content = readFileSync(result.newPath, 'utf8')
    expect(content).toContain('status: in-progress')
  })

  it('does not call pushEvent when WP_BLUEPRINT_PLATFORM_DISABLED=1', async () => {
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')

    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')
    const { adapter, pushEvent } = makeMockAdapter()
    _setSyncAdapterForCli(() => adapter)

    await promoteBlueprint(tmpRepoDir, 'my-feature', 'in-progress')

    expect(pushEvent).not.toHaveBeenCalled()
  })

  it('disabled path produces byte-identical frontmatter output', async () => {
    // Run with platform disabled — uses markdown-canonical path
    tmpRepoDir = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
    vi.stubEnv('WP_BLUEPRINT_PLATFORM_DISABLED', '1')

    const result1 = await promoteBlueprint(tmpRepoDir, 'my-feature', 'in-progress')
    const contentDisabled = readFileSync(result1.newPath, 'utf8')

    // Run with null adapter — same path
    vi.unstubAllEnvs()
    const tmpRepoDir2 = makeRepo('my-feature', OVERVIEW_WITH_TASKS, 'planned')
    _setSyncAdapterForCli(() => null)

    try {
      const result2 = await promoteBlueprint(tmpRepoDir2, 'my-feature', 'in-progress')
      const contentNullAdapter = readFileSync(result2.newPath, 'utf8')
      expect(contentDisabled).toStrictEqual(contentNullAdapter)
    } finally {
      rmSync(tmpRepoDir2, { recursive: true, force: true })
    }
  })
})
