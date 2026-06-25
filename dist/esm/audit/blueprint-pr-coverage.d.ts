import type { RepoAuditResult } from "./repo-guardrails.js";
export interface BlueprintPrCoverageOptions {
    /** PR base ref/sha. Used as `<baseRef>...HEAD`. */
    baseRef?: string;
    /** Test/adapter seam for already-resolved changed files. */
    changedFiles?: readonly string[];
    /** Test/adapter seam for already-resolved commit messages. */
    commitMessages?: readonly string[];
}
export declare function auditBlueprintPrCoverage(rootDirectory?: string, options?: BlueprintPrCoverageOptions): RepoAuditResult;
//# sourceMappingURL=blueprint-pr-coverage.d.ts.map