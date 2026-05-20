/**
 * Unified SQLite adapter for agent-kit.
 *
 * Driver is selected lazily so Node's static ESM loader never resolves
 * `bun:sqlite` (which fails outside Bun). Under Bun → `bun:sqlite`; under
 * Node (vitest, CLI) → `better-sqlite3`.
 */
const driverSpec = typeof globalThis.Bun !== 'undefined' ? 'bun:sqlite' : 'better-sqlite3';
const driverModule = (await import(/* @vite-ignore */ driverSpec));
const BunDatabase = (driverModule.Database ??
    driverModule.default);
if (!BunDatabase) {
    throw new Error(`Could not resolve a SQLite Database constructor from driver "${driverSpec}"`);
}
export class Database {
    _db;
    constructor(filename, options) {
        this._db = new BunDatabase(filename, options);
    }
    prepare(sql) {
        return this._db.prepare(sql);
    }
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