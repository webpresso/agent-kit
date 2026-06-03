import { z } from 'zod';
/**
 * Date that can be either a YYYY-MM-DD string or a Date object.
 * gray-matter parses YAML dates as Date objects, so we need to handle both.
 */
export declare const dateString: z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>;
/**
 * Base frontmatter fields shared by all document types.
 * All fields are optional to allow incremental adoption.
 */
export declare const baseFrontmatter: z.ZodObject<{
    type: z.ZodOptional<z.ZodString>;
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
        complete: "complete";
        active: "active";
        review: "review";
        deferred: "deferred";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type BaseFrontmatter = z.infer<typeof baseFrontmatter>;
/**
 * Status values for implementation plans
 */
export declare const implementationStatus: z.ZodEnum<{
    completed: "completed";
    draft: "draft";
    planned: "planned";
    parked: "parked";
    "in-progress": "in-progress";
    archived: "archived";
    current: "current";
    complete: "complete";
    deferred: "deferred";
    deprioritized: "deprioritized";
    future: "future";
}>;
/**
 * Complexity levels for implementation plans
 */
export declare const complexity: z.ZodEnum<{
    XS: "XS";
    S: "S";
    M: "M";
    L: "L";
    XL: "XL";
}>;
//# sourceMappingURL=common.d.ts.map