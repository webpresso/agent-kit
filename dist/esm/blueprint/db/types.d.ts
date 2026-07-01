import { z } from "zod";
export declare const TaskRowSchema: z.ZodObject<{
    id: z.ZodNumber;
    blueprint_slug: z.ZodString;
    task_id: z.ZodString;
    wave: z.ZodNullable<z.ZodString>;
    lane: z.ZodNullable<z.ZodString>;
    title: z.ZodString;
    status: z.ZodEnum<{
        "in-progress": "in-progress";
        todo: "todo";
        blocked: "blocked";
        done: "done";
        dropped: "dropped";
    }>;
}, z.core.$loose>;
export declare const TaskRowCompactSchema: z.ZodObject<{
    status: z.ZodEnum<{
        "in-progress": "in-progress";
        todo: "todo";
        blocked: "blocked";
        done: "done";
        dropped: "dropped";
    }>;
    title: z.ZodString;
    lane: z.ZodNullable<z.ZodString>;
    task_id: z.ZodString;
    wave: z.ZodNullable<z.ZodString>;
}, z.core.$loose>;
export declare const BpRowSchema: z.ZodObject<{
    slug: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<{
        draft: "draft";
        planned: "planned";
        parked: "parked";
        "in-progress": "in-progress";
        completed: "completed";
        archived: "archived";
    }>;
    complexity: z.ZodNullable<z.ZodEnum<{
        XS: "XS";
        S: "S";
        M: "M";
        L: "L";
        XL: "XL";
    }>>;
    owner: z.ZodNullable<z.ZodString>;
    last_updated: z.ZodNullable<z.ZodString>;
    content_hash: z.ZodString;
    ingested_at: z.ZodNumber;
    file_path: z.ZodString;
}, z.core.$loose>;
export declare const BpDetailRowSchema: z.ZodObject<{
    slug: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<{
        draft: "draft";
        planned: "planned";
        parked: "parked";
        "in-progress": "in-progress";
        completed: "completed";
        archived: "archived";
    }>;
    complexity: z.ZodNullable<z.ZodEnum<{
        XS: "XS";
        S: "S";
        M: "M";
        L: "L";
        XL: "XL";
    }>>;
    owner: z.ZodNullable<z.ZodString>;
    last_updated: z.ZodNullable<z.ZodString>;
    content_hash: z.ZodString;
    ingested_at: z.ZodNumber;
    file_path: z.ZodString;
}, z.core.$loose>;
export type TaskRow = z.infer<typeof TaskRowSchema>;
export type TaskRowCompact = z.infer<typeof TaskRowCompactSchema>;
export type BpRow = z.infer<typeof BpRowSchema>;
export type BpDetailRow = z.infer<typeof BpDetailRowSchema>;
//# sourceMappingURL=types.d.ts.map