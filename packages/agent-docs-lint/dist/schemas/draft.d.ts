import { z } from 'zod';
/**
 * Status values for draft documents
 */
export declare const draftStatus: z.ZodEnum<["wip", "review", "approved", "rejected"]>;
/**
 * Schema for draft document frontmatter.
 * Drafts are work-in-progress documents that will be merged into target files.
 */
export declare const draftFrontmatter: z.ZodObject<{
    /** Must be 'draft' */
    type: z.ZodLiteral<"draft">;
    /** Current status of the draft */
    status: z.ZodEnum<["wip", "review", "approved", "rejected"]>;
    /** Target file path where this draft will be merged */
    target: z.ZodString;
    /** Brief description of what this draft adds/changes */
    purpose: z.ZodString;
    /** Creation date in YYYY-MM-DD format */
    created: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>;
    /** Last update date in YYYY-MM-DD format */
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    /** Author (claude or human identifier) */
    author: z.ZodOptional<z.ZodString>;
    /** Related documents or references */
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Open questions that need resolution */
    open_questions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status: "review" | "approved" | "wip" | "rejected";
    type: "draft";
    target: string;
    purpose: string;
    last_updated?: string | undefined;
    related?: string[] | undefined;
    created?: string | undefined;
    author?: string | undefined;
    open_questions?: string[] | undefined;
}, {
    status: "review" | "approved" | "wip" | "rejected";
    type: "draft";
    target: string;
    created: string | Date;
    purpose: string;
    last_updated?: string | Date | undefined;
    related?: string[] | undefined;
    author?: string | undefined;
    open_questions?: string[] | undefined;
}>;
export type DraftFrontmatter = z.infer<typeof draftFrontmatter>;
/**
 * Required sections for draft documents
 */
export declare const draftSections: readonly ["Purpose", "Content"];
