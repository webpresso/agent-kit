/**
 * `wp audit blueprint-db-consistency` — SQL-backed consistency check between
 * the SQLite blueprints DB and the filesystem.
 *
 * Alpha gate: only runs meaningful checks when WP_USE_SQL_AUDITS=1.
 * Without the flag returns a disabled notice (pass: true).
 *
 * Checks (when enabled):
 * 1. Every `blueprints` row's `file_path` actually exists on disk.
 * 2. Every canonical blueprint markdown file on disk has a corresponding DB row.
 * 3. `content_hash` in DB matches the current SHA-256 of the file content.
 */
import type { RepoAuditResult } from './repo-guardrails.js';
export declare function auditBlueprintDbConsistency(cwd: string): Promise<RepoAuditResult>;
//# sourceMappingURL=blueprint-db-consistency.d.ts.map