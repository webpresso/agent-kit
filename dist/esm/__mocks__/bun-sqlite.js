/**
 * Vitest shim for `bun:sqlite`.
 *
 * `bun:sqlite` is Bun's built-in SQLite driver and is unavailable in Node.js.
 * Aliased as `bun:sqlite` in vitest.config.ts so tests running under Node.js
 * transparently use `better-sqlite3`, which has an intentionally compatible
 * synchronous API (same `.prepare().get()/.all()/.run()` shape).
 *
 * Re-exports the default export as the named `{ Database }` export to match
 * bun:sqlite's export shape (`import { Database } from 'bun:sqlite'`).
 */
import Database from 'better-sqlite3';
export { Database };
//# sourceMappingURL=bun-sqlite.js.map