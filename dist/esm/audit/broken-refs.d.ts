import type { RepoAuditViolation } from './repo-guardrails.js';
export interface BrokenRefViolation extends RepoAuditViolation {
    file: string;
    link: string;
    message: string;
}
export interface BrokenRefsResult {
    violations: BrokenRefViolation[];
    checked: number;
    pass: boolean;
}
export interface BrokenRefsOptions {
    staged?: boolean;
}
/**
 * Audit broken relative links in agent markdown files.
 */
export declare function auditBrokenRefs(cwd: string, options?: BrokenRefsOptions): BrokenRefsResult;
/**
 * Adapter to return a RepoAuditResult shape for registry integration.
 */
export declare function auditBrokenRefsAsRepoResult(cwd: string, options?: BrokenRefsOptions): ReturnType<typeof auditBrokenRefs> & {
    ok: boolean;
    title: string;
};
//# sourceMappingURL=broken-refs.d.ts.map