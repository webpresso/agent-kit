import { z } from 'zod';
/**
 * Frontmatter schema for research documents.
 * Located in docs/research/
 */
export declare const researchFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"research">>;
    status: z.ZodOptional<z.ZodEnum<["active", "archived", "superseded", "in-progress", "current", "draft"]>>;
    date: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    methodology: z.ZodOptional<z.ZodString>;
    findings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "active" | "archived" | "in-progress" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: "research" | undefined;
    date?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    methodology?: string | undefined;
    findings?: string[] | undefined;
}, {
    status?: "draft" | "active" | "archived" | "in-progress" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    type?: "research" | undefined;
    date?: string | Date | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    methodology?: string | undefined;
    findings?: string[] | undefined;
}>;
export type ResearchFrontmatter = z.infer<typeof researchFrontmatter>;
