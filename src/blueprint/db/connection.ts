import { Database, type Statement } from '#db/sqlite.js'

import { runMigrations } from './migrations/run.js'

export type DbConnection = {
  readonly db: Database
  readonly close: () => void
}

export function openDb(dbPath: string): DbConnection {
  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db)
  return {
    db,
    close: () => db.close(),
  }
}

export function preparedQuery<T>(db: Database, sql: string): Statement<[], T> {
  return db.prepare<[], T>(sql)
}
