/**
 * Unified SQLite adapter for agent-kit.
 *
 * At runtime: uses `bun:sqlite` (Bun's native, zero-dep SQLite).
 * In vitest (Node.js): `bun:sqlite` is aliased to the better-sqlite3 shim
 * at src/__mocks__/bun-sqlite.ts via vitest.config.ts resolve.alias.
 *
 * Exposes `Statement<Params, ReturnType>` with Params-first generic order
 * (matching better-sqlite3 conventions) so existing call sites typecheck
 * without modification. The internal bun:sqlite prepare call uses ReturnType-first
 * order; the cast is intentional and safe — the SQL query determines the actual
 * return shape.
 */

import { Database as BunDatabase } from 'bun:sqlite'

/** Statement interface with better-sqlite3-compatible generic order. */
export interface Statement<
  Params extends unknown[] = unknown[],
  ReturnType = Record<string, unknown>,
> {
  get(...params: Params): ReturnType | undefined | null
  all(...params: Params): ReturnType[]
  run(...params: Params): { changes: number; lastInsertRowid: number | bigint }
  finalize?(): void
}

export interface DatabaseOptions {
  readonly?: boolean
  create?: boolean
  readwrite?: boolean
}

export class Database {
  private readonly _db: BunDatabase

  constructor(filename: string, options?: DatabaseOptions) {
    this._db = new BunDatabase(filename, options)
  }

  /**
   * Prepare a SQL statement.
   * Generic order matches better-sqlite3: Params first, ReturnType second.
   */
  prepare<Params extends unknown[] = unknown[], ReturnType = Record<string, unknown>>(
    sql: string,
  ): Statement<Params, ReturnType> {
    return this._db.prepare(sql) as unknown as Statement<Params, ReturnType>
  }

  /** Execute SQL statements (DDL, PRAGMA, etc.) with no result set. */
  exec(sql: string): void {
    this._db.exec(sql)
  }

  close(): void {
    this._db.close()
  }

  get inTransaction(): boolean {
    return this._db.inTransaction
  }

  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return this._db.transaction(fn)
  }
}
