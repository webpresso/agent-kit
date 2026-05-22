/**
 * `wp audit cross-repo-correlation`
 *
 * Wraps `auditCrossRepoCorrelation` from the blueprint cross-repo module into
 * the standard `RepoAuditResult` shape used by the audit registry.
 *
 * FAIL LOUD: any leak or missing allowlist produces a non-zero exit via the
 * audit framework. The audit does NOT auto-mutate anything.
 *
 * Alpha gate: only runs meaningful checks when WP_USE_SQL_AUDITS=1.
 */
import type { RepoAuditResult } from './repo-guardrails.js';
export declare function auditCrossRepoCorrelationAsRepoResult(cwd: string): Promise<RepoAuditResult>;
//# sourceMappingURL=cross-repo-correlation.d.ts.map