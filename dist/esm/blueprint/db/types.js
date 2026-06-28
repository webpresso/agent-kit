import { z } from "zod";
import { blueprintComplexitySchema, blueprintStatusSchema, taskStatusSchema } from "./enums.js";
const nullableTextSchema = z.string().nullable();
export const TaskRowSchema = z.looseObject({
    id: z.number().int(),
    blueprint_slug: z.string(),
    task_id: z.string(),
    wave: nullableTextSchema,
    lane: nullableTextSchema,
    title: z.string(),
    status: taskStatusSchema,
});
export const TaskRowCompactSchema = TaskRowSchema.pick({
    task_id: true,
    title: true,
    status: true,
    wave: true,
    lane: true,
});
export const BpRowSchema = z.looseObject({
    slug: z.string(),
    title: z.string(),
    status: blueprintStatusSchema,
    complexity: blueprintComplexitySchema.nullable(),
    owner: z.string().nullable(),
    last_updated: z.string().nullable(),
    content_hash: z.string(),
    ingested_at: z.number().int(),
    file_path: z.string(),
});
export const BpDetailRowSchema = BpRowSchema;
//# sourceMappingURL=types.js.map