import { z } from 'zod';
/**
 * Schema for ongoing-initiative documents
 * Used for long-running quality/maintenance tasks in docs/ongoing-initiatives/
 */
export declare const ongoingInitiativeFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodLiteral<"ongoing-initiative">;
    status: z.ZodEnum<["active", "archived", "superseded", "draft", "in-progress", "current"]>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
}, "strip", z.ZodTypeAny, {
    status: "draft" | "active" | "archived" | "in-progress" | "current" | "superseded";
    type: "ongoing-initiative";
    last_updated?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    status: "draft" | "active" | "archived" | "in-progress" | "current" | "superseded";
    type: "ongoing-initiative";
    last_updated?: string | Date | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
/**
 * Schema for plan-artifact documents
 * Used for supplementary files in implementation plans (INDEX.md, EXECUTIVE-SUMMARY.md, etc.)
 */
export declare const planArtifactFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodLiteral<"plan-artifact">;
    artifact_type: z.ZodEnum<["reference", "strategy", "matrix", "guide", "spec"]>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
}, "strip", z.ZodTypeAny, {
    type: "plan-artifact";
    artifact_type: "guide" | "reference" | "strategy" | "matrix" | "spec";
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    type: "plan-artifact";
    artifact_type: "guide" | "reference" | "strategy" | "matrix" | "spec";
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
/**
 * Schema for plan-report documents
 * Used for reports within implementation plans (violations-report.md, etc.)
 */
export declare const planReportFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodLiteral<"plan-report">;
    report_type: z.ZodString;
    generated_date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
}, "strip", z.ZodTypeAny, {
    type: "plan-report";
    report_type: string;
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    generated_date?: string | undefined;
}, {
    type: "plan-report";
    report_type: string;
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    generated_date?: string | Date | undefined;
}>;
