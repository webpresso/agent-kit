/**
 * `agent-hooks` scaffolder — wires ak-* hooks into:
 *   - `.claude/settings.json` (Claude Code)
 *   - `.codex/hooks.json` (Codex CLI)
 *
 * Additive: never removes existing hooks, only ensures agent-kit's entries
 * are present. Uses installed bin paths so consumers don't need bun.
 *
 * Runs by default on every `ak setup`.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type MergeOptions, type MergeResult, patchJsonFile } from '#cli/commands/init/merge'

// Claude Code uses $CLAUDE_PROJECT_DIR; Codex runs from repo root so relative path works.
const CC_BIN = (name: string) => `"$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}"`
const CODEX_BIN = (name: string) => `./node_modules/.bin/${name}`

type HookEntry = { type: string; command: string; timeout?: number }
type HookGroup = { matcher?: string; hooks: HookEntry[] }
type HooksMap = Record<string, HookGroup[]>

function hasCommand(groups: HookGroup[], command: string): boolean {
  return groups.some((g) => g.hooks.some((h) => h.command === command))
}

function ensureGroup(groups: HookGroup[], group: HookGroup): HookGroup[] {
  if (hasCommand(groups, group.hooks[0]!.command)) return groups
  return [...groups, group]
}

// ── Claude Code (.claude/settings.json) ──────────────────────────────────────

function patchClaudeSettings(existing: Record<string, unknown>): Record<string, unknown> {
  const hooks = (existing.hooks ?? {}) as HooksMap

  return {
    ...existing,
    hooks: {
      ...hooks,
      SessionStart: ensureGroup(hooks.SessionStart ?? [], {
        hooks: [{ type: 'command', command: CC_BIN('ak-sessionstart-routing'), timeout: 5 }],
      }),
      PreToolUse: ensureGroup(
        ensureGroup(hooks.PreToolUse ?? [], {
          matcher: 'Bash|Write|Edit',
          hooks: [{ type: 'command', command: CC_BIN('ak-pretool-guard'), timeout: 5 }],
        }),
        {
          matcher: 'Skill',
          hooks: [
            {
              type: 'command',
              command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack.sh"',
            },
          ],
        },
      ),
      PostToolUse: ensureGroup(hooks.PostToolUse ?? [], {
        matcher: 'Write|Edit',
        hooks: [{ type: 'command', command: CC_BIN('ak-post-tool'), timeout: 15 }],
      }),
      UserPromptSubmit: ensureGroup(hooks.UserPromptSubmit ?? [], {
        hooks: [{ type: 'command', command: CC_BIN('ak-guard-switch'), timeout: 5 }],
      }),
      Stop: ensureGroup(hooks.Stop ?? [], {
        hooks: [{ type: 'command', command: CC_BIN('ak-stop-qa') }],
      }),
    },
  }
}

// ── Codex CLI (.codex/hooks.json) ────────────────────────────────────────────
// Codex hooks.json uses event names as top-level keys (no outer "hooks" wrapper).
// File edits go through apply_patch; "Edit"/"Write" are accepted matcher aliases.

function patchCodexHooks(existing: Record<string, unknown>): Record<string, unknown> {
  const e = existing as HooksMap

  return {
    ...e,
    SessionStart: ensureGroup(e.SessionStart ?? [], {
      hooks: [{ type: 'command', command: CODEX_BIN('ak-sessionstart-routing'), timeout: 5 }],
    }),
    PreToolUse: ensureGroup(e.PreToolUse ?? [], {
      matcher: 'Bash|Edit|Write',
      hooks: [{ type: 'command', command: CODEX_BIN('ak-pretool-guard'), timeout: 5 }],
    }),
    PostToolUse: ensureGroup(e.PostToolUse ?? [], {
      matcher: 'Edit|Write',
      hooks: [{ type: 'command', command: CODEX_BIN('ak-post-tool'), timeout: 15 }],
    }),
    UserPromptSubmit: ensureGroup(e.UserPromptSubmit ?? [], {
      hooks: [{ type: 'command', command: CODEX_BIN('ak-guard-switch'), timeout: 5 }],
    }),
    Stop: ensureGroup(e.Stop ?? [], {
      hooks: [{ type: 'command', command: CODEX_BIN('ak-stop-qa') }],
    }),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ScaffoldAgentHooksInput {
  repoRoot: string
  options: MergeOptions
}

export interface ScaffoldAgentHooksResult {
  claude: MergeResult
  codex: MergeResult
}

const GSTACK_CHECK_SH = `#!/bin/sh
# Pre-skill hook: verify gstack is installed.
# If missing, clone and set it up automatically, then allow.
GSTACK_DIR="$HOME/.claude/skills/gstack"
if [ -d "$GSTACK_DIR/bin" ]; then
  exit 0
fi
echo "gstack not found — installing..." >&2
if git clone --depth 1 https://github.com/garrytan/gstack.git "$GSTACK_DIR" 2>/dev/null; then
  cd "$GSTACK_DIR" && ./setup --team 2>/dev/null && exit 0
fi
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"gstack is required for skills but could not be auto-installed. Install manually:\\n  git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack\\n  cd ~/.claude/skills/gstack && ./setup --team\\nThen restart Claude Code."}}\\n'
`

function ensureGstackHook(repoRoot: string): void {
  const hooksDir = join(repoRoot, '.claude', 'hooks')
  const hookPath = join(hooksDir, 'check-gstack.sh')
  if (existsSync(hookPath)) return
  mkdirSync(hooksDir, { recursive: true })
  writeFileSync(hookPath, GSTACK_CHECK_SH, 'utf8')
  chmodSync(hookPath, 0o755)
}

export function scaffoldAgentHooks(input: ScaffoldAgentHooksInput): ScaffoldAgentHooksResult {
  ensureGstackHook(input.repoRoot)
  return {
    claude: patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), patchClaudeSettings, input.options),
    codex: patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), patchCodexHooks, input.options),
  }
}
