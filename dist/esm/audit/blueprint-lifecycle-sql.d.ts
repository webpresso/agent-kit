/**
 * `ak audit blueprint-lifecycle-sql` — SQL-backed rewrite of the existing
 * blueprint-lifecycle audit.
 *
 * Uses the SQLite replica as the primary source when the DB file exists.
 * Falls back to the markdown-based audit when the DB has not been built yet.
 *
 * SQL checks (when DB exists):
 * 1. Blueprints with status='in-progress' that have 0 tasks (invalid).
 * 2. Blueprints whose `status` column doesn't match the directory segment
 *    derived from `file_path` (e.g. stored in completed/ but status=in-progress).
 * 3. Tasks in state 'in-progress' whose dependencies are not all done.
 * 4. Blueprints with progress_pct < 100 but status='completed'.
 */
import type { RepoAuditResult } from './repo-guardrails.js';
export declare function auditBlueprintLifecycleSql(cwd: string): Promise<RepoAuditResult>;
//# sourceMappingURL=blueprint-lifecycle-sql.d.ts.map