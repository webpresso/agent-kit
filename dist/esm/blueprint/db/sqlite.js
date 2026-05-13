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
import { Database as BunDatabase } from 'bun:sqlite';
export class Database {
    _db;
    constructor(filename, options) {
        this._db = new BunDatabase(filename, options);
    }
    /**
     * Prepare a SQL statement.
     * Generic order matches better-sqlite3: Params first, ReturnType second.
     */
    prepare(sql) {
        return this._db.prepare(sql);
    }
    /** Execute SQL statements (DDL, PRAGMA, etc.) with no result set. */
    exec(sql) {
        this._db.exec(sql);
    }
    close() {
        this._db.close();
    }
    get inTransaction() {
        return this._db.inTransaction;
    }
    transaction(fn) {
        return this._db.transaction(fn);
    }
}
//# sourceMappingURL=sqlite.js.map