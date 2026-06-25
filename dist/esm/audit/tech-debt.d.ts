import type { RepoAuditResult } from "./repo-guardrails.js";
/**
 * Audit all tech-debt markdown files under `root`.
 *
 * The root should be the directory that contains the status subdirectories
 * (accepted/, needs-remediation/, monitoring/, resolved/).
 */
export declare function auditTechDebt(root: string): RepoAuditResult;
//# sourceMappingURL=tech-debt.d.ts.map