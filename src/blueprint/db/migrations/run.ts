import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Database } from '#db/sqlite.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MIGRATIONS_DIR = __dirname

function ensureSchemaVersionTable(db: Database): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT)',
  )
}

function getAppliedVersions(db: Database): Set<number> {
  const rows = db.prepare('SELECT version FROM schema_version').all() as Array<{
    version: number
  }>
  return new Set(rows.map((r) => r.version))
}

function parseMigrationVersion(filename: string): number | null {
  const match = /^(\d+)_/.exec(filename)
  if (!match || match[1] === undefined) return null
  return parseInt(match[1], 10)
}

export function runMigrations(db: Database): void {
  ensureSchemaVersionTable(db)
  const applied = getAppliedVersions(db)

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const version = parseMigrationVersion(file)
    if (version === null || applied.has(version)) continue

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')

    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString(),
      )
    })()
  }
}
