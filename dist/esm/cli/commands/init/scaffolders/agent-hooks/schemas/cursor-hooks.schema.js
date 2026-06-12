/**
 * Zod schema for Cursor 3.x project hooks.json configuration shape.
 *
 * CRITICAL: Cursor 3.x REQUIRES a top-level `version: 1` field.
 * A hooks.json without `version` causes silent total failure — no hooks run.
 *
 * Event names use camelCase (unlike Claude Code's PascalCase).
 * Reference: https://docs.cursor.com/context/rules-for-ai#hooks
 */
import { z } from 'zod';
const cursorHookCommandSchema = z.object({
    type: z.literal('command'),
    command: z.string(),
});
const cursorHookGroupSchema = z.object({
    matcher: z.string().optional(),
    failClosed: z.boolean().optional(),
    hooks: z.array(cursorHookCommandSchema),
});
/**
 * Zod schema for Cursor 3.x hooks.json.
 *
 * `version` is required and must be exactly 1 (z.literal enforces this).
 * Event keys are camelCase per Cursor's convention.
 */
export const cursorHooksSchema = z.object({
    version: z.literal(1),
    preToolUse: z.array(cursorHookGroupSchema).optional(),
    postToolUse: z.array(cursorHookGroupSchema).optional(),
    beforeSubmitPrompt: z.array(cursorHookGroupSchema).optional(),
    sessionStart: z.array(cursorHookGroupSchema).optional(),
    stop: z.array(cursorHookGroupSchema).optional(),
});
//# sourceMappingURL=cursor-hooks.schema.js.map