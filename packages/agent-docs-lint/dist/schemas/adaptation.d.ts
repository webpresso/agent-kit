import { z } from 'zod';
/**
 * Frontmatter schema for adaptation documents.
 * Located in docs/adaptations/
 */
export declare const adaptationFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"adaptation">>;
    focus: z.ZodString;
    status: z.ZodEnum<["in-progress", "complete", "superseded"]>;
    created: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    priority: z.ZodOptional<z.ZodEnum<["P0", "P1", "P2", "P3"]>>;
}, "strip", z.ZodTypeAny, {
    status: "complete" | "in-progress" | "superseded";
    focus: string;
    last_updated?: string | undefined;
    type?: "adaptation" | undefined;
    priority?: "P0" | "P1" | "P2" | "P3" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    created?: string | undefined;
}, {
    status: "complete" | "in-progress" | "superseded";
    focus: string;
    last_updated?: string | Date | undefined;
    type?: "adaptation" | undefined;
    priority?: "P0" | "P1" | "P2" | "P3" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    created?: string | Date | undefined;
}>;
export type AdaptationFrontmatter = z.infer<typeof adaptationFrontmatter>;
