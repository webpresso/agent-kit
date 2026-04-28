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
            SessionStart: ensureGroup(hooks.SessionStart ?? [], {
                hooks: [{ type: 'command', command: CC_BIN('ak-sessionstart-routing'), timeout: 5 }],
            }),
            PreToolUse: ensureGroup(hooks.PreToolUse ?? [], {
                matcher: 'Bash|Write|Edit',
                hooks: [{ type: 'command', command: CC_BIN('ak-pretool-guard'), timeout: 5 }],
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
export function scaffoldAgentHooks(input) {
    return {
        claude: patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), patchClaudeSettings, input.options),
        codex: patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), patchCodexHooks, input.options),
    };
}
//# sourceMappingURL=index.js.map