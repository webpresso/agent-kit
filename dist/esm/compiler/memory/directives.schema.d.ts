import { z } from "zod";
export declare const directiveOpSchema: z.ZodEnum<{
    replace: "replace";
    delete: "delete";
    append: "append";
    prepend: "prepend";
    rotate: "rotate";
}>;
export declare const rotateConfigSchema: z.ZodObject<{
    archive_to: z.ZodDefault<z.ZodString>;
    threshold_days: z.ZodDefault<z.ZodNumber>;
    keep_summary: z.ZodDefault<z.ZodBoolean>;
    rotation_eligible: z.ZodLiteral<true>;
    last_rotation_acked: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const sectionDirectiveSchema: z.ZodObject<{
    heading: z.ZodString;
    op: z.ZodEnum<{
        replace: "replace";
        delete: "delete";
        append: "append";
        prepend: "prepend";
        rotate: "rotate";
    }>;
    content: z.ZodOptional<z.ZodString>;
    rotation_eligible: z.ZodOptional<z.ZodBoolean>;
    archive_to: z.ZodOptional<z.ZodString>;
    threshold_days: z.ZodOptional<z.ZodNumber>;
    keep_summary: z.ZodOptional<z.ZodBoolean>;
    last_rotation_acked: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SectionDirective = z.infer<typeof sectionDirectiveSchema>;
export type DirectiveOp = z.infer<typeof directiveOpSchema>;
export type RotateConfig = z.infer<typeof rotateConfigSchema>;
export declare const memoryMergeYamlSchema: z.ZodObject<{
    sections: z.ZodOptional<z.ZodArray<z.ZodObject<{
        heading: z.ZodString;
        op: z.ZodEnum<{
            replace: "replace";
            delete: "delete";
            append: "append";
            prepend: "prepend";
            rotate: "rotate";
        }>;
        content: z.ZodOptional<z.ZodString>;
        rotation_eligible: z.ZodOptional<z.ZodBoolean>;
        archive_to: z.ZodOptional<z.ZodString>;
        threshold_days: z.ZodOptional<z.ZodNumber>;
        keep_summary: z.ZodOptional<z.ZodBoolean>;
        last_rotation_acked: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    frontmatter_patch: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type MemoryMergeYaml = z.infer<typeof memoryMergeYamlSchema>;
//# sourceMappingURL=directives.schema.d.ts.map