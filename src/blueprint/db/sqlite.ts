/**
 * Unified SQLite adapter for agent-kit.
 *
 * Driver is selected lazily so neither bundlers nor Node's static ESM loader
 * ever see a literal `bun:sqlite` specifier. Under Bun the constructor
 * resolves `bun:sqlite`; under Node (vitest, CLI) it resolves `better-sqlite3`.
 */

import { createRequire } from 'node:module'

const requireFromHere = createRequire(import.meta.url)

type BunDatabaseLike = {
  prepare(sql: string): unknown
  exec(sql: string): void
  close(): void
  readonly inTransaction: boolean
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
}

type BunDatabaseCtor = new (filename: string, options?: DatabaseOptions) => BunDatabaseLike

let cachedDriver: BunDatabaseCtor | undefined

function resolveDriver(): BunDatabaseCtor {
  if (cachedDriver) return cachedDriver
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
  const spec = isBun ? 'bun:sqlite' : 'better-sqlite3'
  const mod = requireFromHere(spec) as {
    Database?: BunDatabaseCtor
    default?: BunDatabaseCtor
  } & BunDatabaseCtor
  const ctor = (mod.Database ?? mod.default ?? mod) as BunDatabaseCtor
  if (typeof ctor !== 'function') {
    throw new Error(`Could not resolve a SQLite Database constructor from driver "${spec}"`)
  }
  cachedDriver = ctor
  return ctor
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
    const Driver = resolveDriver()
    this._db = new Driver(filename, options)
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
