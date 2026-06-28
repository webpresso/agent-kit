import type { RepoAuditResult } from "./repo-guardrails.js";
export type BucketName = "platform" | "tenant-orchestration" | "tenant-artifacts";
export interface BucketViolation {
    package: string;
    rule: "code-level" | "wrangler-binding";
    description: string;
    severity: "error" | "warning";
}
export interface BucketBoundaryOptions {
    /** Restrict to packages touched in git diff --name-only origin/main */
    changedOnly?: boolean;
    /** Zero-tolerance: allowlist entries become errors too */
    strict?: boolean;
    /** Monorepo root (defaults to cwd) */
    root?: string;
}
/**
 * Main audit entry point.
 */
export declare function auditBucketBoundary(root: string, options?: BucketBoundaryOptions): Promise<RepoAuditResult>;
//# sourceMappingURL=bucket-boundary.d.ts.map