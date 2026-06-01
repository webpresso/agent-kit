import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = __dirname;
function ensureSchemaVersionTable(db) {
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT)');
}
function getAppliedVersions(db) {
    const rows = db.prepare('SELECT version FROM schema_version').all();
    return new Set(rows.map((r) => r.version));
}
function parseMigrationVersion(filename) {
    const match = /^(\d+)_/.exec(filename);
    if (!match || match[1] === undefined)
        return null;
    return parseInt(match[1], 10);
}
export function runMigrations(db) {
    ensureSchemaVersionTable(db);
    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    for (const file of files) {
        const version = parseMigrationVersion(file);
        if (version === null)
            continue;
        const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        db.exec('BEGIN IMMEDIATE');
        try {
            const applied = getAppliedVersions(db);
            if (applied.has(version)) {
                db.exec('COMMIT');
                continue;
            }
            db.exec(sql);
            db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
            db.exec('COMMIT');
        }
        catch (error) {
            // Only ROLLBACK if a transaction is actually active. If BEGIN IMMEDIATE
            // itself failed (e.g. SQLITE_BUSY), there is no open transaction and a
            // ROLLBACK here would throw a secondary "cannot rollback" error that
            // masks the original SQLITE_BUSY, preventing openDb's retry loop from
            // recognising the error as retryable.
            if (db.inTransaction) {
                db.exec('ROLLBACK');
            }
            throw error;
        }
    }
}
//# sourceMappingURL=run.js.map