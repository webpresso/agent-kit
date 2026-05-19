import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js';
export interface SkillSizeViolation extends RepoAuditViolation {
    file: string;
    kind: 'description-too-large' | 'file-too-large' | 'codex-listing-total-too-large';
    bytes: number;
    maxBytes: number;
}
export interface SkillSizesResult {
    violations: SkillSizeViolation[];
    codexListingTotal: number;
    codexListingMaxBytes: number;
    pass: boolean;
}
export interface SkillSizesOptions {
    staged?: boolean;
}
/**
 * Audit skill SKILL.md sizes in `.agent/skills/<name>/SKILL.md`.
 */
export declare function auditSkillSizes(cwd: string, options?: SkillSizesOptions): SkillSizesResult;
/**
 * Adapter to return a RepoAuditResult shape for registry integration.
 */
export declare function auditSkillSizesAsRepoResult(cwd: string, options?: SkillSizesOptions): RepoAuditResult;
//# sourceMappingURL=skill-sizes.d.ts.map