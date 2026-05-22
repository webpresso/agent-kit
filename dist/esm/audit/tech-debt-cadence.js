/**
 * `wp audit tech-debt-cadence` — SQL-backed cadence health check for
 * tech-debt items.
 *
 * Alpha gate: only runs queries when AK_USE_SQL_AUDITS=1.
 * Without the flag returns a disabled notice (pass: true).
 *
 * Checks (when enabled):
 * 1. Items with `next_review` in the past (overdue).
 * 2. Critical items whose review_cadence is not 'weekly'.
 * 3. Items that have never been reviewed (last_reviewed IS NULL)
 *    AND were created more than 90 days ago.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
const DB_PATH = path.join('.agent', '.blueprints.db');
export async function auditTechDebtCadence(cwd) {
    if (!process.env['AK_USE_SQL_AUDITS']) {
        return {
            ok: true,
            title: 'Tech-debt cadence (SQL) — disabled (set AK_USE_SQL_AUDITS=1)',
            checked: 0,
            violations: [],
        };
    }
    const dbFile = path.join(cwd, DB_PATH);
    if (!existsSync(dbFile)) {
        return {
            ok: true,
            title: 'Tech-debt cadence (SQL)',
            checked: 0,
            violations: [],
        };
    }
    const { Database } = await import('#db/sqlite.js');
    const db = new Database(dbFile, { readonly: true });
    const violations = [];
    try {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        // -----------------------------------------------------------------------
        // 1. Items with next_review in the past (overdue)
        // -----------------------------------------------------------------------
        const overdue = db
            .prepare(`SELECT slug, file_path, severity, review_cadence, next_review, last_reviewed, created
         FROM tech_debt_items
         WHERE next_review IS NOT NULL
           AND next_review < ?`)
            .all(today);
        for (const row of overdue) {
            violations.push({
                file: row.file_path,
                message: `Tech-debt item '${row.slug}' is overdue for review (next_review: ${row.next_review})`,
            });
        }
        // -----------------------------------------------------------------------
        // 2. Critical items without weekly cadence
        // -----------------------------------------------------------------------
        const criticalNonWeekly = db
            .prepare(`SELECT slug, file_path, severity, review_cadence, next_review, last_reviewed, created
         FROM tech_debt_items
         WHERE severity = 'critical'
           AND review_cadence != 'weekly'`)
            .all();
        for (const row of criticalNonWeekly) {
            violations.push({
                file: row.file_path,
                message: `Critical tech-debt item '${row.slug}' has cadence '${row.review_cadence}' — critical items require weekly cadence`,
            });
        }
        // -----------------------------------------------------------------------
        // 3. Never-reviewed items created more than 90 days ago
        // -----------------------------------------------------------------------
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffDate = cutoff.toISOString().slice(0, 10);
        const neverReviewed = db
            .prepare(`SELECT slug, file_path, severity, review_cadence, next_review, last_reviewed, created
         FROM tech_debt_items
         WHERE last_reviewed IS NULL
           AND created IS NOT NULL
           AND created < ?`)
            .all(cutoffDate);
        for (const row of neverReviewed) {
            violations.push({
                file: row.file_path,
                message: `Tech-debt item '${row.slug}' has never been reviewed and was created on ${row.created} (>${90} days ago)`,
            });
        }
        const checked = overdue.length + criticalNonWeekly.length + neverReviewed.length;
        return {
            ok: violations.length === 0,
            title: 'Tech-debt cadence (SQL)',
            checked,
            violations,
        };
    }
    finally {
        db.close();
    }
}
//# sourceMappingURL=tech-debt-cadence.js.map