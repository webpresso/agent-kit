import { z } from 'zod';
/**
 * Frontmatter schema for evaluations.
 * Located in docs/evaluations/
 */
export declare const evaluationFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
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
    type: z.ZodOptional<z.ZodLiteral<"evaluation">>;
    evaluation_date: z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>;
    model: z.ZodString;
    evaluator_version: z.ZodOptional<z.ZodString>;
    subject: z.ZodString;
    scope: z.ZodString;
    rating: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type EvaluationFrontmatter = z.infer<typeof evaluationFrontmatter>;
//# sourceMappingURL=evaluation.d.ts.map