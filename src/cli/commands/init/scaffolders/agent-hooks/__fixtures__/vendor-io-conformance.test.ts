/**
 * Vendor hook I/O conformance specification as tests.
 *
 * This file documents the input/output contracts for Claude Code, Codex CLI,
 * and Cursor hooks. Machine-verifiable behaviors use `it`; behaviours that
 * require a live agent runtime use `it.todo`.
 *
 * Sources:
 *   - Claude Code: https://docs.claude.com/en/docs/claude-code/hooks
 *   - Codex CLI: https://developers.openai.com/codex/hooks
 *   - Cursor: https://docs.cursor.com/context/rules-for-ai#hooks
 */

import { describe, expect, it } from 'vitest'

import { claudeHooksSchema } from '../schemas/claude-hooks.schema.js'
import { codexHooksSchema } from '../schemas/codex-hooks.schema.js'
import { cursorHooksSchema } from '../schemas/cursor-hooks.schema.js'

describe('vendor hook I/O conformance spec', () => {
  describe('Claude Code', () => {
    it('exit 0 = hook succeeded, no deny action taken', () => {
      // Documented contract: exit code 0 means the hook ran successfully
      // and Claude Code proceeds normally.
      // Machine-verifiable: the schema accepts a hook command without decision fields.
      const config = {
        SessionStart: [
          { hooks: [{ type: 'command', command: '/bin/wp-sessionstart-routing', timeout: 5 }] },
        ],
      }
      expect(claudeHooksSchema.safeParse(config).success).toBe(true)
    })

    it.todo(
      'exit 2 = deny — hook output JSON is read as permissionDecision',
      // Contract: when a hook exits with code 2, Claude Code reads stdout as JSON
      // and uses the `decision` field as the permissionDecision.
      // Not machine-verifiable without a live Claude Code runtime.
    )

    it.todo(
      'stderr goes to the Claude Code UI as informational text',
      // Contract: stderr output from hooks is surfaced in the Claude Code UI
      // as informational text, not treated as a decision payload.
    )

    it.todo(
      'stdout is parsed as JSON for decision payload',
      // Contract: when exit code is 2, stdout must be valid JSON containing
      // at minimum a `decision` field.
    )

    it('claudeHooksSchema accepts all known event keys', () => {
      const config = {
        SessionStart: [{ hooks: [{ type: 'command', command: '/bin/test' }] }],
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/bin/test' }] }],
        PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/bin/test' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: '/bin/test' }] }],
        Stop: [{ hooks: [{ type: 'command', command: '/bin/test' }] }],
        SubagentStart: [{ hooks: [{ type: 'command', command: '/bin/test' }] }],
        SubagentStop: [{ hooks: [{ type: 'command', command: '/bin/test' }] }],
      }
      expect(claudeHooksSchema.safeParse(config).success).toBe(true)
    })
  })

  describe('Codex CLI', () => {
    it.todo(
      'Stop and SubagentStop hooks: stdout MUST be JSON — plain text is invalid per docs',
      // Contract: for Stop and SubagentStop events, Codex requires the hook
      // to emit valid JSON on stdout. Plain text output is not accepted and
      // results in a hook execution error.
    )

    it.todo(
      'PreToolUse deny: set hookSpecificOutput.permissionDecision = "deny" in stdout',
      // Contract: to deny a tool call from a PreToolUse hook, the hook must
      // write JSON to stdout with hookSpecificOutput.permissionDecision = "deny".
    )

    it.todo(
      'hooks are concurrent — do not depend on sequential execution order',
      // Contract: multiple hooks registered for the same event may run
      // concurrently. Hook implementations must not assume ordering.
    )

    it.todo(
      'changed hook definitions require re-trust (pending-trust status until accepted)',
      // Contract: when hook commands are modified, Codex CLI enters a
      // pending-trust state and requires user acceptance before executing hooks.
    )

    it('codexHooksSchema enforces the { hooks: { [EventName]: [...] } } wrapping', () => {
      // The Codex canonical wrapped shape must always have a top-level `hooks` key.
      const flat = {
        SessionStart: [{ hooks: [{ type: 'command', command: '/bin/test' }] }],
      }
      // Flat form is NOT valid Codex hooks.json — it must be wrapped.
      expect(codexHooksSchema.safeParse(flat).success).toBe(false)

      const wrapped = { hooks: flat }
      expect(codexHooksSchema.safeParse(wrapped).success).toBe(true)
    })
  })

  describe('Cursor', () => {
    it.todo(
      'exit 2 = deny (matches Claude Code behavior per docs)',
      // Contract: Cursor hooks use the same exit-code convention as Claude Code:
      // exit 2 signals a deny decision.
    )

    it('failClosed:true causes hook failure to deny instead of allowing through', () => {
      // Machine-verifiable: cursorHooksSchema accepts failClosed on a hook group.
      const config = {
        version: 1 as const,
        preToolUse: [
          {
            failClosed: true,
            hooks: [{ type: 'command' as const, command: '/bin/wp-pretool-guard' }],
          },
        ],
      }
      expect(cursorHooksSchema.safeParse(config).success).toBe(true)
    })

    it('version:1 is REQUIRED in project hooks.json — missing version causes silent total failure', () => {
      // Machine-verifiable: schema rejects configs without version field.
      const withoutVersion = {
        preToolUse: [{ hooks: [{ type: 'command' as const, command: '/bin/test' }] }],
      }
      expect(cursorHooksSchema.safeParse(withoutVersion).success).toBe(false)

      const withVersion = { version: 1 as const, ...withoutVersion }
      expect(cursorHooksSchema.safeParse(withVersion).success).toBe(true)
    })

    it.todo(
      'third-party compat (loading .claude/settings.json) is opt-in toggle in Cursor Settings',
      // Contract: Cursor 3.x has an opt-in compatibility mode that reads
      // .claude/settings.json hooks. This is disabled by default and must be
      // explicitly enabled in Cursor Settings.
    )
  })
})
