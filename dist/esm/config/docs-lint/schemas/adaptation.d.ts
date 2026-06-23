import { z } from 'zod';
/**
 * Frontmatter schema for adaptation documents.
 * Located in docs/adaptations/
 */
export declare const adaptationFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"adaptation">>;
    focus: z.ZodString;
    status: z.ZodEnum<{
        "in-progress": "in-progress";
        superseded: "superseded";
        complete: "complete";
    }>;
    created: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    priority: z.ZodOptional<z.ZodEnum<{
        P0: "P0";
        P1: "P1";
        P2: "P2";
        P3: "P3";
    }>>;
}, z.core.$strip>;
export type AdaptationFrontmatter = z.infer<typeof adaptationFrontmatter>;
//# sourceMappingURL=adaptation.d.ts.map