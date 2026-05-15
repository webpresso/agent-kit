import { Database, type Statement } from '#db/sqlite.js'

import { runMigrations } from './migrations/run.js'

export type DbConnection = {
  readonly db: Database
  readonly close: () => void
}

const OPEN_DB_BUSY_RETRY_MS = 50
const OPEN_DB_BUSY_RETRIES = 5

function isSqliteBusy(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('SQLITE_BUSY') || error.message.includes('database is locked')
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function initializeDb(db: Database): void {
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db)
}

export function openDb(dbPath: string): DbConnection {
  const db = new Database(dbPath)

  let lastError: unknown = null
  for (let attempt = 0; attempt <= OPEN_DB_BUSY_RETRIES; attempt += 1) {
    try {
      initializeDb(db)
      return {
        db,
        close: () => db.close(),
      }
    } catch (error) {
      lastError = error
      if (!isSqliteBusy(error) || attempt === OPEN_DB_BUSY_RETRIES) {
        db.close()
        throw error
      }
      sleepSync(OPEN_DB_BUSY_RETRY_MS)
    }
  }

  db.close()
  throw lastError
}

export function preparedQuery<T>(db: Database, sql: string): Statement<[], T> {
  return db.prepare<[], T>(sql)
}
