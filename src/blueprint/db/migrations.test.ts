import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openDb } from './connection.js'
import { runMigrations } from './migrations/run.js'

const EXPECTED_TABLES = [
  'schema_version',
  'blueprints',
  'tags',
  'blueprint_tags',
  'blueprint_dependencies',
  'tasks',
  'task_dependencies',
  'task_files',
  'risks',
  'edge_cases',
  'tech_debt_items',
  'tech_debt_linked_blueprints',
  'workspace_repos',
  'cross_repo_dependencies',
  'correlate_allowlist',
] as const

function getTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string }>
  return rows.map((r) => r.name)
}

let tmpDir: string
let dbPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'ak-db-test-'))
  dbPath = path.join(tmpDir, 'test.db')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('migrations', () => {
  it('creates all 15 expected tables', () => {
    const conn = openDb(dbPath)
    try {
      const tables = getTableNames(conn.db)
      for (const expected of EXPECTED_TABLES) {
        expect(tables).toContain(expected)
      }
      expect(tables).toHaveLength(EXPECTED_TABLES.length)
    } finally {
      conn.close()
    }
  })

  it('is idempotent — running migrations twice does not error', () => {
    const conn = openDb(dbPath)
    conn.close()

    const conn2 = openDb(dbPath)
    const tables = getTableNames(conn2.db)
    conn2.close()

    expect(tables).toContain('blueprints')
  })

  it('records exactly one row in schema_version after migration', () => {
    const conn = openDb(dbPath)
    try {
      const rows = conn.db
        .prepare('SELECT version FROM schema_version ORDER BY version')
        .all() as Array<{ version: number }>
      expect(rows).toHaveLength(1)
      expect(rows[0]?.version).toBe(1)
    } finally {
      conn.close()
    }
  })

  it('runMigrations is idempotent when called directly on an open db', () => {
    const db = new Database(dbPath)
    db.pragma('foreign_keys = ON')
    runMigrations(db)
    runMigrations(db)
    const rows = db
      .prepare('SELECT version FROM schema_version')
      .all() as Array<{ version: number }>
    expect(rows).toHaveLength(1)
    db.close()
  })

  it('inserts 1000 blueprints and 1000 tasks in under 200ms', () => {
    const conn = openDb(dbPath)
    try {
      const insertBlueprint = conn.db.prepare(
        `INSERT INTO blueprints
          (slug, title, status, file_path, byte_size, content_hash, ingested_at, organization, visibility)
         VALUES (?, ?, 'planned', ?, 100, 'hash', 0, 'test-org', 'private')`,
      )
      const insertTask = conn.db.prepare(
        `INSERT INTO tasks (blueprint_slug, task_id, title, status)
         VALUES (?, ?, ?, 'todo')`,
      )

      const start = Date.now()

      conn.db.transaction(() => {
        for (let i = 0; i < 1000; i++) {
          insertBlueprint.run(`slug-${i}`, `Blueprint ${i}`, `blueprints/slug-${i}.md`)
        }
      })()

      conn.db.transaction(() => {
        for (let i = 0; i < 1000; i++) {
          insertTask.run(`slug-${i % 1000}`, `task-${i}`, `Task ${i}`)
        }
      })()

      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(200)
    } finally {
      conn.close()
    }
  })
})
