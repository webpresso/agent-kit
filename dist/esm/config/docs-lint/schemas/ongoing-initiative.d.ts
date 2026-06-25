import { z } from "zod";
/**
 * Schema for ongoing-initiative documents
 * Used for long-running quality/maintenance tasks in docs/ongoing-initiatives/
 */
export declare const ongoingInitiativeFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"ongoing-initiative">;
    status: z.ZodEnum<{
        draft: "draft";
        "in-progress": "in-progress";
        archived: "archived";
        superseded: "superseded";
        current: "current";
        active: "active";
    }>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
}, z.core.$strip>;
/**
 * Schema for plan-artifact documents
 * Used for supplementary files in implementation plans (INDEX.md, EXECUTIVE-SUMMARY.md, etc.)
 */
export declare const planArtifactFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        blocked: "blocked";
        completed: "completed";
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        archived: "archived";
        open: "open";
        superseded: "superseded";
        accepted: "accepted";
        review: "review";
        deferred: "deferred";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        complete: "complete";
        current: "current";
        deprecated: "deprecated";
        active: "active";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"plan-artifact">;
    artifact_type: z.ZodEnum<{
        guide: "guide";
        reference: "reference";
        strategy: "strategy";
        matrix: "matrix";
        spec: "spec";
    }>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
}, z.core.$strip>;
/**
 * Schema for plan-report documents
 * Used for reports within implementation plans (violations-report.md, etc.)
 */
export declare const planReportFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        blocked: "blocked";
        completed: "completed";
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        archived: "archived";
        open: "open";
        superseded: "superseded";
        accepted: "accepted";
        review: "review";
        deferred: "deferred";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        complete: "complete";
        current: "current";
        deprecated: "deprecated";
        active: "active";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"plan-report">;
    report_type: z.ZodString;
    generated_date: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
}, z.core.$strip>;
//# sourceMappingURL=ongoing-initiative.d.ts.map