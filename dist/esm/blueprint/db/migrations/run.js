import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findPackageAsset } from '#utils/package-assets.js';
const PACKAGED_MIGRATIONS_RELATIVE_DIR = 'dist/esm/blueprint/db/migrations';
function resolvePackagedMigrationsDir() {
    const found = findPackageAsset(PACKAGED_MIGRATIONS_RELATIVE_DIR);
    if (found)
        return found;
    throw new Error(`Missing packaged blueprint migrations at ${PACKAGED_MIGRATIONS_RELATIVE_DIR}. ` +
        '@webpresso/agent-kit runtime DB migrations require the published SQL assets under dist/esm.');
}
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
    const migrationsDir = resolvePackagedMigrationsDir();
    ensureSchemaVersionTable(db);
    const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    for (const file of files) {
        const version = parseMigrationVersion(file);
        if (version === null)
            continue;
        const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
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