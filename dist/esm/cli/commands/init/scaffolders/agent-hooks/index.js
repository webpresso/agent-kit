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
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchJsonFile } from '#cli/commands/init/merge';
// Claude Code uses $CLAUDE_PROJECT_DIR; Codex runs from repo root so relative path works.
const CC_BIN = (name) => `"$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}"`;
const CODEX_BIN = (name) => `./node_modules/.bin/${name}`;
function hasCommand(groups, command) {
    return groups.some((g) => g.hooks.some((h) => h.command === command));
}
function ensureGroup(groups, group) {
    if (hasCommand(groups, group.hooks[0].command))
        return groups;
    return [...groups, group];
}
// ── Claude Code (.claude/settings.json) ──────────────────────────────────────
function patchClaudeSettings(existing) {
    const hooks = (existing.hooks ?? {});
    return {
        ...existing,
        hooks: {
            ...hooks,
            SessionStart: ensureGroup(ensureGroup(hooks.SessionStart ?? [], {
                hooks: [{ type: 'command', command: CC_BIN('ak-sessionstart-routing'), timeout: 5 }],
            }), {
                // Soft warning at session start — non-blocking, no network.
                hooks: [
                    {
                        type: 'command',
                        command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack-session.sh"',
                        timeout: 2,
                    },
                ],
            }),
            PreToolUse: ensureGroup(ensureGroup(hooks.PreToolUse ?? [], {
                matcher: 'Bash|Write|Edit',
                hooks: [{ type: 'command', command: CC_BIN('ak-pretool-guard'), timeout: 5 }],
            }), {
                matcher: 'Skill',
                hooks: [
                    {
                        type: 'command',
                        command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack.sh"',
                        timeout: 3,
                    },
                ],
            }),
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
    };
}
// ── Codex CLI (.codex/hooks.json) ────────────────────────────────────────────
// Codex hooks.json uses event names as top-level keys (no outer "hooks" wrapper).
// File edits go through apply_patch; "Edit"/"Write" are accepted matcher aliases.
function patchCodexHooks(existing) {
    const e = existing;
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
    };
}
// Fast existence check — no network, no install, sub-10ms.
// Installation is handled by `ak setup --with gstack`, not at hook runtime.
const GSTACK_CHECK_SH = `#!/bin/sh
if [ -d "$HOME/.claude/skills/gstack/bin" ]; then
  exit 0
fi
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"gstack is not installed. Fix: run \`ak setup --with gstack\` then restart Claude Code."}}\\n'
`;
// SessionStart soft warning — emits additionalContext, never blocks.
const GSTACK_SESSION_SH = `#!/bin/sh
if [ -d "$HOME/.claude/skills/gstack/bin" ]; then
  exit 0
fi
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"WARNING: gstack is not installed. Skills like /browse, /qa, /ship are unavailable. Fix: run \`ak setup --with gstack\` then restart."}}\n'
`;
function ensureGstackHooks(repoRoot) {
    const hooksDir = join(repoRoot, '.claude', 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    const preToolPath = join(hooksDir, 'check-gstack.sh');
    if (!existsSync(preToolPath)) {
        writeFileSync(preToolPath, GSTACK_CHECK_SH, 'utf8');
        chmodSync(preToolPath, 0o755);
    }
    const sessionPath = join(hooksDir, 'check-gstack-session.sh');
    if (!existsSync(sessionPath)) {
        writeFileSync(sessionPath, GSTACK_SESSION_SH, 'utf8');
        chmodSync(sessionPath, 0o755);
    }
}
export function scaffoldAgentHooks(input) {
    ensureGstackHooks(input.repoRoot);
    return {
        claude: patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), patchClaudeSettings, input.options),
        codex: patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), patchCodexHooks, input.options),
    };
}
//# sourceMappingURL=index.js.map