import { z } from 'zod';
/**
 * Schema for Rule documents in docs/rules/
 */
export declare const ruleFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
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
    type: z.ZodLiteral<"rule">;
    priority: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>;
    enforcement: z.ZodEnum<{
        manual: "manual";
        automated: "automated";
        hybrid: "hybrid";
    }>;
}, z.core.$strip>;
export type RuleFrontmatter = z.infer<typeof ruleFrontmatter>;
export declare const ruleSections: string[];
//# sourceMappingURL=rule.d.ts.map