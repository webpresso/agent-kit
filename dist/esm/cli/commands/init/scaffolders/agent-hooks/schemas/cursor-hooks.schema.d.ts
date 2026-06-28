/**
 * Zod schema for Cursor 3.x project hooks.json configuration shape.
 *
 * CRITICAL: Cursor 3.x REQUIRES a top-level `version: 1` field.
 * A hooks.json without `version` causes silent total failure — no hooks run.
 *
 * Event names use camelCase (unlike Claude Code's PascalCase).
 * Reference: https://cursor.com/docs/hooks
 */
import { z } from "zod";
/**
 * Zod schema for Cursor 3.x hooks.json.
 *
 * `version` is required and must be exactly 1 (z.literal enforces this).
 * Event keys are camelCase per Cursor's convention.
 */
export declare const cursorHooksSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    preToolUse: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        failClosed: z.ZodOptional<z.ZodBoolean>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    postToolUse: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        failClosed: z.ZodOptional<z.ZodBoolean>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    beforeSubmitPrompt: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        failClosed: z.ZodOptional<z.ZodBoolean>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    sessionStart: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        failClosed: z.ZodOptional<z.ZodBoolean>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    preCompact: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        failClosed: z.ZodOptional<z.ZodBoolean>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    stop: z.ZodOptional<z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        failClosed: z.ZodOptional<z.ZodBoolean>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type CursorHooksConfig = z.infer<typeof cursorHooksSchema>;
//# sourceMappingURL=cursor-hooks.schema.d.ts.map