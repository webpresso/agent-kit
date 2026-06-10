import { z } from 'zod';
/**
 * Status values for draft documents
 */
export declare const draftStatus: z.ZodEnum<{
    rejected: "rejected";
    review: "review";
    approved: "approved";
    wip: "wip";
}>;
/**
 * Schema for draft document frontmatter.
 * Drafts are work-in-progress documents that will be merged into target files.
 */
export declare const draftFrontmatter: z.ZodObject<{
    type: z.ZodLiteral<"draft">;
    status: z.ZodEnum<{
        rejected: "rejected";
        review: "review";
        approved: "approved";
        wip: "wip";
    }>;
    target: z.ZodString;
    purpose: z.ZodString;
    created: z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    author: z.ZodOptional<z.ZodString>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    open_questions: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type DraftFrontmatter = z.infer<typeof draftFrontmatter>;
/**
 * Required sections for draft documents
 */
export declare const draftSections: readonly ["Purpose", "Content"];
//# sourceMappingURL=draft.d.ts.map