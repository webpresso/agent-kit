import { type RepoAuditResult } from './repo-guardrails.js';
export interface VisionRequiredSection {
    /** Human-readable label used in error messages. */
    label: string;
    /** Lowercase H2 heading texts that satisfy this section (case-insensitive match). */
    synonyms: readonly string[];
}
export interface VisionOptions {
    /** Path to VISION.md, relative to root. Default: `'VISION.md'`. */
    visionPath?: string;
    /** Maximum line count for the body (frontmatter excluded). Default: 100. */
    maxLines?: number;
    /** Maximum word count for the body. Default: 1500. */
    maxWords?: number;
    /** Required H2 sections. Each is satisfied if any synonym matches a present heading. */
    requiredSections?: readonly VisionRequiredSection[];
    /** Soft-warn (not error) if `last_updated` is older than this many days. Default: 365. 0 disables. */
    staleAfterDays?: number;
}
export declare function auditVision(rootDirectory?: string, options?: VisionOptions): RepoAuditResult;
//# sourceMappingURL=vision-doc.d.ts.map