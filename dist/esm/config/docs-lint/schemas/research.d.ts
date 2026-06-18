import { z } from 'zod';
/**
 * Frontmatter schema for research documents.
 * Located in docs/research/
 */
export declare const researchFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"research">>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        "in-progress": "in-progress";
        archived: "archived";
        superseded: "superseded";
        current: "current";
        active: "active";
    }>>;
    date: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    methodology: z.ZodOptional<z.ZodString>;
    findings: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ResearchFrontmatter = z.infer<typeof researchFrontmatter>;
//# sourceMappingURL=research.d.ts.map