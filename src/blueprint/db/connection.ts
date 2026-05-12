import Database from 'better-sqlite3'

import { runMigrations } from './migrations/run.js'

export type DbConnection = {
  readonly db: Database.Database
  readonly close: () => void
}

export function openDb(dbPath: string): DbConnection {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return {
    db,
    close: () => db.close(),
  }
}

export function preparedQuery<T>(db: Database.Database, sql: string): Database.Statement<T[]> {
  return db.prepare<T[]>(sql)
}
