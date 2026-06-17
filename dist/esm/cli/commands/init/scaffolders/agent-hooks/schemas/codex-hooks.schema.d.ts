/**
 * Zod schema for Codex CLI's hooks configuration shape.
 *
 * Codex wraps all hook event groups under a top-level `hooks` key:
 *   { "hooks": { "PreToolUse": [...], "SessionStart": [...] } }
 *
 * Reference: https://developers.openai.com/codex/hooks
 */
import { z } from 'zod';
/**
 * Full Codex hooks.json schema.
 * The canonical wrapped shape: `{ hooks: { [EventName]: [...] } }`
 */
export declare const codexHooksSchema: z.ZodObject<{
    hooks: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
        matcher: z.ZodOptional<z.ZodString>;
        hooks: z.ZodArray<z.ZodObject<{
            type: z.ZodLiteral<"command">;
            command: z.ZodString;
            timeout: z.ZodOptional<z.ZodNumber>;
            statusMessage: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type CodexHooksConfig = z.infer<typeof codexHooksSchema>;
//# sourceMappingURL=codex-hooks.schema.d.ts.map