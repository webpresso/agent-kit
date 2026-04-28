import { z } from 'zod';
/**
 * Schema for Rule documents in docs/rules/
 */
export declare const ruleFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodLiteral<"rule">;
    priority: z.ZodEnum<["critical", "high", "medium", "low"]>;
    enforcement: z.ZodEnum<["automated", "manual", "hybrid"]>;
}, "strip", z.ZodTypeAny, {
    type: "rule";
    priority: "critical" | "high" | "medium" | "low";
    enforcement: "automated" | "manual" | "hybrid";
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    type: "rule";
    priority: "critical" | "high" | "medium" | "low";
    enforcement: "automated" | "manual" | "hybrid";
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
export type RuleFrontmatter = z.infer<typeof ruleFrontmatter>;
export declare const ruleSections: string[];
