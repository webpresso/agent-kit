import { z } from 'zod';
/**
 * Frontmatter schema for implementation plans.
 * Located in webpresso/blueprints/.
 */
export declare const implementationPlanFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodEnum<["blueprint"]>>;
    status: z.ZodOptional<z.ZodEnum<["draft", "in-progress", "complete", "completed", "archived", "parked", "deprioritized", "future", "planned", "deferred", "current"]>>;
    complexity: z.ZodOptional<z.ZodEnum<["XS", "S", "M", "L", "XL"]>>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    depends_on: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    epic: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "deferred" | "current" | "parked" | "deprioritized" | "future" | undefined;
    complexity?: "XS" | "S" | "M" | "L" | "XL" | undefined;
    last_updated?: string | undefined;
    type?: "blueprint" | undefined;
    epic?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    depends_on?: string[] | undefined;
}, {
    status?: "draft" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "deferred" | "current" | "parked" | "deprioritized" | "future" | undefined;
    complexity?: "XS" | "S" | "M" | "L" | "XL" | undefined;
    last_updated?: string | Date | undefined;
    type?: "blueprint" | undefined;
    epic?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    depends_on?: string[] | undefined;
}>;
export type ImplementationPlanFrontmatter = z.infer<typeof implementationPlanFrontmatter>;
/**
 * Required sections for implementation plans
 * Note: Disabled - implementation plans have varied structures (phases, tasks, etc.)
 * that don't fit a strict Problem/Goal/Solution template
 */
export declare const implementationPlanSections: readonly [];
