import { z } from 'zod';
export declare const decisionFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"decision">>;
    status: z.ZodEnum<["proposed", "accepted", "deprecated", "superseded"]>;
    date: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>;
    decision: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "accepted" | "deprecated" | "superseded" | "proposed";
    decision: string;
    last_updated?: string | undefined;
    type?: "decision" | undefined;
    date?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    status: "accepted" | "deprecated" | "superseded" | "proposed";
    decision: string;
    date: string | Date;
    last_updated?: string | Date | undefined;
    type?: "decision" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
