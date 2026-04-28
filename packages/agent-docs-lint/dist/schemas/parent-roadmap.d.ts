import { z } from 'zod';
/**
 * Frontmatter schema for parent roadmaps (group-level planning documents).
 * Located in webpresso/blueprints/<group>/README.md.
 * Groups related initiatives under a common theme.
 */
export declare const parentRoadmapFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodLiteral<"parent-roadmap">;
    status: z.ZodOptional<z.ZodEnum<["draft", "in-progress", "complete", "completed", "archived", "parked", "deprioritized", "future", "planned", "deferred", "current"]>>;
    complexity: z.ZodOptional<z.ZodEnum<["L", "XL"]>>;
    created: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
}, "strip", z.ZodTypeAny, {
    type: "parent-roadmap";
    status?: "draft" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "deferred" | "current" | "parked" | "deprioritized" | "future" | undefined;
    complexity?: "L" | "XL" | undefined;
    last_updated?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    created?: string | undefined;
}, {
    type: "parent-roadmap";
    status?: "draft" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "deferred" | "current" | "parked" | "deprioritized" | "future" | undefined;
    complexity?: "L" | "XL" | undefined;
    last_updated?: string | Date | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    created?: string | Date | undefined;
}>;
export type ParentRoadmapFrontmatter = z.infer<typeof parentRoadmapFrontmatter>;
/**
 * Required sections for parent roadmaps
 * Note: Disabled - parent roadmaps have varied structures
 */
export declare const parentRoadmapSections: readonly [];
