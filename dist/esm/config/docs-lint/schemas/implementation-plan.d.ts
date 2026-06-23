import { z } from 'zod';
/**
 * Frontmatter schema for implementation plans.
 * Located in webpresso/blueprints/.
 */
export declare const implementationPlanFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodEnum<{
        blueprint: "blueprint";
    }>>;
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
        XS: "XS";
        S: "S";
        M: "M";
        L: "L";
        XL: "XL";
    }>>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    depends_on: z.ZodOptional<z.ZodArray<z.ZodString>>;
    cross_repo_depends_on: z.ZodOptional<z.ZodArray<z.ZodObject<{
        repo: z.ZodString;
        slug: z.ZodString;
        require_status: z.ZodOptional<z.ZodEnum<{
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
    }, z.core.$strip>>>;
    epic: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ImplementationPlanFrontmatter = z.infer<typeof implementationPlanFrontmatter>;
/**
 * Required sections for implementation plans
 * Note: Disabled - implementation plans have varied structures (phases, tasks, etc.)
 * that don't fit a strict Problem/Goal/Solution template
 */
export declare const implementationPlanSections: readonly [];
//# sourceMappingURL=implementation-plan.d.ts.map