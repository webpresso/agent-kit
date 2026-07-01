import { type ContentKind } from "./loader.js";
export interface AuditFinding {
    readonly severity: "error" | "warning";
    readonly kind: ContentKind;
    readonly slug: string;
    readonly filePath: string;
    readonly message: string;
}
export interface AuditResult {
    readonly findings: readonly AuditFinding[];
    readonly passed: boolean;
}
export interface AuditOptions {
    readonly catalogDir: string;
    readonly consumerRoot?: string;
    readonly kind: ContentKind;
    readonly staleReviewDays?: number;
}
export declare function auditContent(options: AuditOptions): AuditResult;
//# sourceMappingURL=audit.d.ts.map