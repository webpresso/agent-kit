/**
 * Zod schema for Claude Code's hooks configuration shape.
 *
 * Validates the `hooks` key of .claude/settings.json.
 * Reference: https://docs.claude.com/en/docs/claude-code/hooks
 */
import { z } from 'zod';
/**
 * Valid top-level event keys recognised by Claude Code.
 * Kept as a readonly tuple so CLAUDE_HOOK_EVENT_NAMES can be derived.
 */
export declare const CLAUDE_HOOK_EVENT_NAMES: readonly ["SessionStart", "PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop", "PostToolUseFailure", "PermissionRequest", "SubagentStart", "SubagentStop", "SessionEnd", "PreCompact", "PostCompact"];
export type ClaudeHookEventName = (typeof CLAUDE_HOOK_EVENT_NAMES)[number];
/**
 * Zod schema for the full Claude Code hooks config object
 * (the value of the `hooks` key in .claude/settings.json).
 *
 * Uses z.record with string keys so unknown event names (future Claude Code
 * additions) pass validation — we validate structure, not the key allowlist.
 */
export declare const claudeHooksSchema: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
    matcher: z.ZodOptional<z.ZodString>;
    hooks: z.ZodArray<z.ZodObject<{
        type: z.ZodLiteral<"command">;
        command: z.ZodString;
        timeout: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>>>;
export type ClaudeHooksConfig = z.infer<typeof claudeHooksSchema>;
//# sourceMappingURL=claude-hooks.schema.d.ts.map