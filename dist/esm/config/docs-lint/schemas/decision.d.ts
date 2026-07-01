import { z } from "zod";
export declare const decisionFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"decision">>;
    status: z.ZodEnum<{
        superseded: "superseded";
        accepted: "accepted";
        deprecated: "deprecated";
        proposed: "proposed";
    }>;
    date: z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>;
    decision: z.ZodString;
}, z.core.$strip>;
//# sourceMappingURL=decision.d.ts.map