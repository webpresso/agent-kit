import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openDb } from '../blueprint/db/connection.js'
import { auditBlueprintLifecycleSql } from './blueprint-lifecycle-sql.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): { cwd: string; agentDir: string; dbPath: string } {
  const cwd = mkdtempSync(path.join(tmpdir(), 'ak-audit-bp-lifecycle-sql-'))
  const agentDir = path.join(cwd, '.agent')
  mkdirSync(agentDir, { recursive: true })
  const dbPath = path.join(agentDir, '.blueprints.db')
  return { cwd, agentDir, dbPath }
}

function insertBlueprint(
  db: ReturnType<typeof openDb>['db'],
  opts: {
    slug: string
    status: string
    filePath: string
    progressPct?: number | null
  },
): void {
  db.prepare(
    `INSERT INTO blueprints
       (slug, title, status, file_path, byte_size, content_hash, ingested_at,
        organization, visibility, progress_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.slug,
    `Blueprint ${opts.slug}`,
    opts.status,
    opts.filePath,
    100,
    'deadbeef',
    Date.now(),
    'test-org',
    'private',
    opts.progressPct ?? null,
  )
}

function insertTask(
  db: ReturnType<typeof openDb>['db'],
  opts: {
    blueprintSlug: string
    taskId: string
    status: string
  },
): number {
  const stmt = db.prepare(
    `INSERT INTO tasks (blueprint_slug, task_id, title, status)
     VALUES (?, ?, ?, ?)`,
  )
  const result = stmt.run(opts.blueprintSlug, opts.taskId, `Task ${opts.taskId}`, opts.status)
  return result.lastInsertRowid as number
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let cwd: string
let dbPath: string

beforeEach(() => {
  const repo = makeTempRepo()
  cwd = repo.cwd
  dbPath = repo.dbPath
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  delete process.env['AK_USE_SQL_AUDITS']
})

describe('auditBlueprintLifecycleSql — env gate', () => {
  it('falls back to regex audit when AK_USE_SQL_AUDITS is not set', async () => {
    delete process.env['AK_USE_SQL_AUDITS']
    // No blueprints directory — regex audit returns ok with 0 checked
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    // Title comes from the fallback audit
    expect(result.title).toContain('Blueprint lifecycle')
  })
})

describe('auditBlueprintLifecycleSql — with AK_USE_SQL_AUDITS=1', () => {
  beforeEach(() => {
    process.env['AK_USE_SQL_AUDITS'] = '1'
  })

  it('returns ok when DB is empty', async () => {
    openDb(dbPath).close()
    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('catches blueprint with 0 tasks in in-progress state', async () => {
    const conn = openDb(dbPath)
    try {
      insertBlueprint(conn.db, {
        slug: 'empty-wip',
        status: 'in-progress',
        filePath: 'blueprints/in-progress/empty-wip/_overview.md',
      })
      // No tasks inserted — violation expected
    } finally {
      conn.close()
    }

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('empty-wip') && /0 tasks|no tasks/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('passes when in-progress blueprint has at least one task', async () => {
    const conn = openDb(dbPath)
    try {
      insertBlueprint(conn.db, {
        slug: 'active-wip',
        status: 'in-progress',
        filePath: 'blueprints/in-progress/active-wip/_overview.md',
      })
      insertTask(conn.db, {
        blueprintSlug: 'active-wip',
        taskId: '1.1',
        status: 'todo',
      })
    } finally {
      conn.close()
    }

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('catches status/directory mismatch (file in completed/ but status=in-progress)', async () => {
    const conn = openDb(dbPath)
    try {
      insertBlueprint(conn.db, {
        slug: 'mismatched',
        status: 'in-progress',
        // file lives in completed/ directory but status says in-progress
        filePath: 'blueprints/completed/mismatched/_overview.md',
      })
      // Add a task so it doesn't also fail the 0-tasks check
      insertTask(conn.db, {
        blueprintSlug: 'mismatched',
        taskId: '1.1',
        status: 'done',
      })
    } finally {
      conn.close()
    }

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('mismatched') && /status|directory/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('catches completed blueprint with progress_pct < 100', async () => {
    const conn = openDb(dbPath)
    try {
      insertBlueprint(conn.db, {
        slug: 'partial-done',
        status: 'completed',
        filePath: 'blueprints/completed/partial-done/_overview.md',
        progressPct: 80,
      })
    } finally {
      conn.close()
    }

    const result = await auditBlueprintLifecycleSql(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('partial-done') && /progress_pct|80/i.test(v.message),
      ),
    ).toBe(true)
  })
})
