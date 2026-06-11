/**
 * Zod schema for Codex CLI's hooks configuration shape.
 *
 * Codex wraps all hook event groups under a top-level `hooks` key:
 *   { "hooks": { "PreToolUse": [...], "SessionStart": [...] } }
 *
 * Reference: https://developers.openai.com/codex/hooks
 */
import { z } from 'zod';
const codexHookCommandSchema = z.object({
    type: z.literal('command'),
    command: z.string(),
    timeout: z.number().optional(),
    statusMessage: z.string().optional(),
});
const codexHookGroupSchema = z.object({
    matcher: z.string().optional(),
    hooks: z.array(codexHookCommandSchema),
});
/**
 * Inner hooks map: event name → array of hook groups.
 * Codex uses the same event names as Claude Code for shared events.
 */
const codexHooksMapSchema = z.record(z.string(), z.array(codexHookGroupSchema));
/**
 * Full Codex hooks.json schema.
 * The canonical wrapped shape: `{ hooks: { [EventName]: [...] } }`
 */
export const codexHooksSchema = z.object({
    hooks: codexHooksMapSchema,
});
//# sourceMappingURL=codex-hooks.schema.js.map