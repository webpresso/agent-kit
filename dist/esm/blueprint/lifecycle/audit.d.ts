export interface BlueprintAuditIssue {
    file?: string;
    level: "error" | "warning";
    message: string;
}
export interface BlueprintAuditResult {
    issues: BlueprintAuditIssue[];
    ok: boolean;
}
export interface RunBlueprintAuditOptions {
    all?: boolean;
    projectRoot: string;
    stagedFiles?: string[];
    strict?: boolean;
}
interface LifecycleAuditFrontmatter {
    historicalZeroTaskRationale?: unknown;
    historicalZeroTaskWaiver?: unknown;
    status?: unknown;
    type?: unknown;
    worktreeOwnerId?: unknown;
    worktreeOwnerBranch?: unknown;
    approvals?: unknown;
}
/**
 * Promotion gate: a blueprint past `draft` must carry ≥2 approvals from DISTINCT
 * reviewers in its committed `_overview.md` frontmatter `approvals:` (the gate
 * input; the markdown `## Approvals` checklist is a mirror). Frontmatter is
 * version-controlled, so a fabricated tick is visible in git history / PR review.
 */
/**
 * Count DISTINCT reviewers with an `approve` verdict in a frontmatter
 * `approvals:` value. Shared by the audit sweep (warning) and the promote-time
 * hard gate so both apply identical logic.
 */
export declare function countDistinctApprovals(approvals: unknown): number;
export declare function validateApprovalGate(file: string, frontmatter: LifecycleAuditFrontmatter): BlueprintAuditIssue[];
export declare function runBlueprintAudit(options: RunBlueprintAuditOptions): Promise<BlueprintAuditResult>;
export {};
//# sourceMappingURL=audit.d.ts.map