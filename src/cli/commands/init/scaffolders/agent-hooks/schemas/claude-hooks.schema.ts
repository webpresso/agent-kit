/**
 * Zod schema for Claude Code's hooks configuration shape.
 *
 * Validates the `hooks` key of .claude/settings.json.
 * Reference: https://docs.claude.com/en/docs/claude-code/hooks
 */

import { z } from 'zod'

const claudeHookCommandSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
  timeout: z.number().optional(),
})

const claudeHookGroupSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(claudeHookCommandSchema),
})

/**
 * Valid top-level event keys recognised by Claude Code.
 * Kept as a readonly tuple so CLAUDE_HOOK_EVENT_NAMES can be derived.
 */
export const CLAUDE_HOOK_EVENT_NAMES = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'PostToolUseFailure',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd',
  'PreCompact',
  'PostCompact',
] as const

export type ClaudeHookEventName = (typeof CLAUDE_HOOK_EVENT_NAMES)[number]

/**
 * Zod schema for the full Claude Code hooks config object
 * (the value of the `hooks` key in .claude/settings.json).
 *
 * Uses z.record with string keys so unknown event names (future Claude Code
 * additions) pass validation — we validate structure, not the key allowlist.
 */
export const claudeHooksSchema = z.record(z.string(), z.array(claudeHookGroupSchema))

export type ClaudeHooksConfig = z.infer<typeof claudeHooksSchema>
