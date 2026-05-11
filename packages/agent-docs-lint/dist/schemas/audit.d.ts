import { z } from 'zod';
/**
 * Frontmatter schema for audit documents.
 * Located in docs/research/quality-audits/
 */
export declare const auditFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"audit">>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    audit_type: z.ZodOptional<z.ZodEnum<["code-quality", "security", "performance", "accessibility", "other"]>>;
    severity: z.ZodOptional<z.ZodEnum<["critical", "high", "medium", "low", "info"]>>;
    issues_count: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: "audit" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    severity?: "info" | "critical" | "high" | "medium" | "low" | undefined;
    audit_type?: "code-quality" | "security" | "performance" | "accessibility" | "other" | undefined;
    issues_count?: number | undefined;
}, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    type?: "audit" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    severity?: "info" | "critical" | "high" | "medium" | "low" | undefined;
    audit_type?: "code-quality" | "security" | "performance" | "accessibility" | "other" | undefined;
    issues_count?: number | undefined;
}>;
export type AuditFrontmatter = z.infer<typeof auditFrontmatter>;
