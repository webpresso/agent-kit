import { z } from 'zod';
/**
 * Frontmatter schema for evaluations.
 * Located in docs/evaluations/
 */
export declare const evaluationFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"evaluation">>;
    evaluation_date: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>;
    model: z.ZodString;
    evaluator_version: z.ZodOptional<z.ZodString>;
    subject: z.ZodString;
    scope: z.ZodString;
    rating: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    model: string;
    subject: string;
    scope: string;
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: "evaluation" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    evaluation_date?: string | undefined;
    evaluator_version?: string | undefined;
    rating?: number | undefined;
}, {
    evaluation_date: string | Date;
    model: string;
    subject: string;
    scope: string;
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    type?: "evaluation" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    evaluator_version?: string | undefined;
    rating?: number | undefined;
}>;
export type EvaluationFrontmatter = z.infer<typeof evaluationFrontmatter>;
