/**
 * Vitest shim for `bun:sqlite`.
 *
 * `bun:sqlite` is Bun's built-in SQLite driver and is unavailable in Node.js.
 * In Node-based Vitest runs, prefer the stdlib `node:sqlite` binding so tests
 * do not depend on an ABI-matched native addon build.
 */

import { DatabaseSync } from 'node:sqlite'

interface DatabaseOptions {
  readonly?: boolean
  create?: boolean
  readwrite?: boolean
}

export class Database {
  private readonly db: DatabaseSync
  private transactionDepth = 0

  constructor(filename: string, options?: DatabaseOptions) {
    this.db = new DatabaseSync(filename, {
      readOnly: options?.readonly ?? false,
      open: true,
    })
  }

  prepare(sql: string) {
    return this.db.prepare(sql)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  close(): void {
    this.db.close()
  }

  get inTransaction(): boolean {
    return this.transactionDepth > 0
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return (...args: unknown[]) => {
      this.transactionDepth += 1
      this.db.exec('BEGIN')
      try {
        const result = fn(...args)
        this.db.exec('COMMIT')
        return result
      } catch (err: unknown) {
        this.db.exec('ROLLBACK')
        throw err
      } finally {
        this.transactionDepth -= 1
      }
    }
  }
}
