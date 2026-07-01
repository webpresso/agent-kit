/**
 * Unified SQLite adapter for webpresso.
 *
 * Driver is selected lazily so neither bundlers nor Node's static ESM loader
 * ever see a literal `bun:sqlite` specifier. Under Bun the constructor
 * resolves `bun:sqlite`; under Node (vitest, CLI) it resolves `better-sqlite3`.
 */
import { createRequire } from "node:module";
const requireFromHere = createRequire(import.meta.url);
let cachedDriver;
function resolveDriver() {
    if (cachedDriver)
        return cachedDriver;
    const isBun = typeof globalThis.Bun !== "undefined";
    const spec = isBun ? "bun:sqlite" : "better-sqlite3";
    const mod = requireFromHere(spec);
    const ctor = (mod.Database ?? mod.default ?? mod);
    if (typeof ctor !== "function") {
        throw new Error(`Could not resolve a SQLite Database constructor from driver "${spec}"`);
    }
    cachedDriver = ctor;
    return ctor;
}
export class Database {
    _db;
    constructor(filename, options) {
        const Driver = resolveDriver();
        this._db = new Driver(filename, options);
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