import { z } from 'zod';
/**
 * Frontmatter schema for audit documents.
 * Located in docs/research/quality-audits/
 */
export declare const auditFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        blocked: "blocked";
        completed: "completed";
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        archived: "archived";
        superseded: "superseded";
        accepted: "accepted";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        open: "open";
        current: "current";
        deprecated: "deprecated";
        review: "review";
        complete: "complete";
        active: "active";
        deferred: "deferred";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"audit">>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    audit_type: z.ZodOptional<z.ZodEnum<{
        security: "security";
        performance: "performance";
        "code-quality": "code-quality";
        accessibility: "accessibility";
        other: "other";
    }>>;
    severity: z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
        info: "info";
    }>>;
    issues_count: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type AuditFrontmatter = z.infer<typeof auditFrontmatter>;
//# sourceMappingURL=audit.d.ts.map