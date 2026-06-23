import { z } from 'zod';
/**
 * Frontmatter schema for parent roadmaps (group-level planning documents).
 * Located in webpresso/blueprints/<group>/README.md.
 * Groups related initiatives under a common theme.
 */
export declare const parentRoadmapFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"parent-roadmap">;
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        draft: "draft";
        planned: "planned";
        parked: "parked";
        "in-progress": "in-progress";
        archived: "archived";
        deferred: "deferred";
        complete: "complete";
        current: "current";
        deprioritized: "deprioritized";
        future: "future";
    }>>;
    complexity: z.ZodOptional<z.ZodEnum<{
        L: "L";
        XL: "XL";
    }>>;
    created: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
}, z.core.$strip>;
export type ParentRoadmapFrontmatter = z.infer<typeof parentRoadmapFrontmatter>;
/**
 * Required sections for parent roadmaps
 * Note: Disabled - parent roadmaps have varied structures
 */
export declare const parentRoadmapSections: readonly [];
//# sourceMappingURL=parent-roadmap.d.ts.map