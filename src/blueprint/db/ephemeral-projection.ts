/**
 * Ephemeral in-memory blueprint projection.
 *
 * Builds a throwaway SQLite projection of the repo's blueprint markdown in
 * `:memory:` and returns the open connection. The caller runs its queries and
 * `close()`s the connection — nothing is written to disk.
 *
 * This is the data source for the `blueprint-lifecycle` audit: the verdict is a
 * pure function of `markdown@HEAD`, identical in CLI / MCP / `wp doctor` / CI,
 * with zero dependency on any persistent per-worktree projection. The schema is
 * single-sourced through `openDb` → `runMigrations` (same as the persistent
 * store), so the two can never drift.
 *
 * Deliberately does NOT take `withProjectionDbWriteLock`, `mkdirSync`, or
 * `recordProjectionMetadata` — those belong to the persistent `reIngestProjection`
 * / `coldStartIfNeeded` paths. An in-memory DB has no file, no lock, no metadata.
 */

import { openDb, type DbConnection } from "./connection.js";
import { ingestAll } from "./ingester.js";

/**
 * Parse `blueprints/` (+ `tech-debt/`) markdown under `cwd` into a fresh
 * in-memory SQLite projection. Caller owns the returned connection and must
 * `close()` it (typically in a `finally`).
 */
export async function buildEphemeralProjection(cwd: string): Promise<DbConnection> {
  const conn = openDb(":memory:");
  try {
    await ingestAll({ db: conn.db, cwd });
  } catch (error) {
    conn.close();
    throw error;
  }
  return conn;
}
