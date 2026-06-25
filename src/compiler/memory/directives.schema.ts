import { z } from "zod";

export const directiveOpSchema = z.enum(["replace", "append", "prepend", "delete", "rotate"]);

export const rotateConfigSchema = z.object({
  archive_to: z.string().default("AGENTS.history.md"),
  threshold_days: z.number().int().min(30).default(180),
  keep_summary: z.boolean().default(true),
  rotation_eligible: z.literal(true),
  last_rotation_acked: z.string().optional(),
});

// Single flat schema for all directive types.
// When op === 'rotate', the rotate config fields are present;
// for other ops only heading/op/content are used.
// This flat shape avoids union/intersection inference issues in Zod v4.
export const sectionDirectiveSchema = z.object({
  heading: z.string(),
  op: directiveOpSchema,
  content: z.string().optional(),
  // Shared rotation_eligible flag — only meaningful when op === 'rotate'
  rotation_eligible: z.boolean().optional(),
  // Rotate-specific fields (present only when op === 'rotate')
  archive_to: z.string().optional(),
  threshold_days: z.number().int().min(30).optional(),
  keep_summary: z.boolean().optional(),
  last_rotation_acked: z.string().optional(),
});

export type SectionDirective = z.infer<typeof sectionDirectiveSchema>;
export type DirectiveOp = z.infer<typeof directiveOpSchema>;
export type RotateConfig = z.infer<typeof rotateConfigSchema>;

const sectionsArraySchema = z.array(sectionDirectiveSchema);

export const memoryMergeYamlSchema = z.object({
  // sections is optional — missing means no per-section directives
  sections: sectionsArraySchema.optional(),
  frontmatter_patch: z.record(z.string(), z.unknown()).optional(),
});

export type MemoryMergeYaml = z.infer<typeof memoryMergeYamlSchema>;
