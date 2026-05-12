/**
 * Cross-repo correlation audit.
 *
 * Detects two classes of violation:
 *
 * 1. LEAKS — a public blueprint has an unredacted (is_redacted=0) cross-repo
 *    dependency on a private-repo blueprint. The slug has leaked into public
 *    markdown. FAIL LOUD, do NOT auto-mutate.
 *
 * 2. MISSING ALLOWLISTS — a cross-org dependency exists but at least one side
 *    has not allowlisted the other.
 *
 * The audit only detects and reports. Remediation requires manual intervention
 * via `ak fix cross-repo-leak <slug>` (or `fixCrossRepoLeak()` below).
 */
export interface CrossRepoLeak {
    readonly blueprintSlug: string;
    readonly targetRepo: string;
    readonly targetSlug: string;
    readonly sourceVisibility: string;
    readonly targetVisibility: string | null;
}
export interface MissingAllowlist {
    readonly blueprintSlug: string;
    readonly sourceOrg: string;
    readonly targetOrg: string;
    readonly targetRepo: string;
    readonly missingSides: ReadonlyArray<'source' | 'target'>;
}
export interface CrossRepoAuditResult {
    readonly pass: boolean;
    readonly leaks: ReadonlyArray<CrossRepoLeak>;
    readonly missingAllowlists: ReadonlyArray<MissingAllowlist>;
}
export declare function auditCrossRepoCorrelation(cwd: string, _dryRun?: boolean): Promise<CrossRepoAuditResult>;
export interface FixResult {
    readonly fixed: boolean;
    readonly reason: string;
}
/**
 * Remediate a single leak for `blueprintSlug` by redacting its cross-repo
 * target slug in the DB: sets `target_slug=null`, `target_slug_hash=sha256(slug)`,
 * `is_redacted=1`.
 *
 * This function is intentionally NOT called by `auditCrossRepoCorrelation`.
 * It must be invoked explicitly via `ak fix cross-repo-leak <slug>`.
 */
export declare function fixCrossRepoLeak(cwd: string, blueprintSlug: string): Promise<FixResult>;
//# sourceMappingURL=audit.d.ts.map