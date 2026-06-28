/**
 * `wp audit tech-debt-cadence` — SQL-backed cadence health check for
 * tech-debt items.
 *
 * Alpha gate: only runs queries when WP_USE_SQL_AUDITS=1.
 * Without the flag returns a disabled notice (pass: true).
 *
 * Checks (when enabled):
 * 1. Items with `next_review` in the past (overdue).
 * 2. Critical items whose review_cadence is not 'weekly'.
 * 3. Items that have never been reviewed (last_reviewed IS NULL)
 *    AND were created more than 90 days ago.
 */
import type { RepoAuditResult } from "./repo-guardrails.js";
export declare function auditTechDebtCadence(cwd: string): Promise<RepoAuditResult>;
//# sourceMappingURL=tech-debt-cadence.d.ts.map