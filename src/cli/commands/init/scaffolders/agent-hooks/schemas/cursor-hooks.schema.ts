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

const cursorHookCommandSchema = z
  .object({
    type: z.literal("command"),
    command: z.string().trim().min(1),
  })
  .strict();

const cursorHookGroupSchema = z
  .object({
    matcher: z.string().trim().min(1).optional(),
    failClosed: z.boolean().optional(),
    hooks: z.array(cursorHookCommandSchema).min(1),
  })
  .strict();

/**
 * Zod schema for Cursor 3.x hooks.json.
 *
 * `version` is required and must be exactly 1 (z.literal enforces this).
 * Event keys are camelCase per Cursor's convention.
 */
export const cursorHooksSchema = z
  .object({
    version: z.literal(1),
    preToolUse: z.array(cursorHookGroupSchema).min(1).optional(),
    postToolUse: z.array(cursorHookGroupSchema).min(1).optional(),
    beforeSubmitPrompt: z.array(cursorHookGroupSchema).min(1).optional(),
    sessionStart: z.array(cursorHookGroupSchema).min(1).optional(),
    preCompact: z.array(cursorHookGroupSchema).min(1).optional(),
    stop: z.array(cursorHookGroupSchema).min(1).optional(),
  })
  .strict();

export type CursorHooksConfig = z.infer<typeof cursorHooksSchema>;
