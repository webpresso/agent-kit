import { z } from 'zod';
/**
 * Frontmatter schema for cookbook patterns.
 * Located in docs/cookbook/
 */
export declare const cookbookFrontmatter: z.ZodObject<{
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
    type: z.ZodOptional<z.ZodLiteral<"cookbook">>;
    category: z.ZodString;
    difficulty: z.ZodOptional<z.ZodEnum<{
        beginner: "beginner";
        intermediate: "intermediate";
        advanced: "advanced";
    }>>;
    prerequisites: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CookbookFrontmatter = z.infer<typeof cookbookFrontmatter>;
/**
 * Required sections for cookbook patterns
 */
export declare const cookbookSections: readonly [];
//# sourceMappingURL=cookbook.d.ts.map