/**
 * Unified SQLite adapter for agent-kit.
 *
 * Driver is selected lazily so Node's static ESM loader never resolves
 * `bun:sqlite` (which fails outside Bun). Under Bun → `bun:sqlite`; under
 * Node (vitest, CLI) → `better-sqlite3`.
 */

type BunDatabaseLike = {
  prepare(sql: string): unknown
  exec(sql: string): void
  close(): void
  readonly inTransaction: boolean
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
}

type BunDatabaseCtor = new (filename: string, options?: DatabaseOptions) => BunDatabaseLike

const driverSpec =
  typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined' ? 'bun:sqlite' : 'better-sqlite3'

const driverModule = (await import(/* @vite-ignore */ driverSpec)) as {
  Database?: BunDatabaseCtor
  default?: BunDatabaseCtor
}

const BunDatabase: BunDatabaseCtor = (driverModule.Database ??
  driverModule.default) as BunDatabaseCtor

if (!BunDatabase) {
  throw new Error(`Could not resolve a SQLite Database constructor from driver "${driverSpec}"`)
}

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
  private readonly _db: BunDatabaseLike

  constructor(filename: string, options?: DatabaseOptions) {
    this._db = new BunDatabase(filename, options)
  }

  prepare<Params extends unknown[] = unknown[], ReturnType = Record<string, unknown>>(
    sql: string,
  ): Statement<Params, ReturnType> {
    return this._db.prepare(sql) as unknown as Statement<Params, ReturnType>
  }

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
