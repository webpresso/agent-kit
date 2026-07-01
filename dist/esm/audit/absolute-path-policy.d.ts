import type { RepoAuditResult, RepoAuditViolation } from "./repo-guardrails.js";
export declare function shouldScanAbsolutePathPolicyPath(relativePath: string): boolean;
export declare function findAbsolutePathPolicyViolationsInText(relativePath: string, text: string): RepoAuditViolation[];
export declare function auditAbsolutePathPolicy(rootDirectory?: string): RepoAuditResult;
//# sourceMappingURL=absolute-path-policy.d.ts.map