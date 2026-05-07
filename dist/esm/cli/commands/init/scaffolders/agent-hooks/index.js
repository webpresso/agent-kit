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
import { buildSkillTag, extractSkillHooks, isTaggedSkillHook, } from './skill-hooks.js';
// Claude Code uses $CLAUDE_PROJECT_DIR; Codex runs from repo root so relative path works.
//
// CC_BIN wraps the command in a guard so it exits 0 gracefully when node_modules
// hasn't been installed yet (e.g. a fresh worktree before `pnpm install` completes).
// Without the guard every hook fires an error on first session start in new worktrees.
const CC_BIN = (name) => `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`;
const CODEX_BIN = (name) => `./node_modules/.bin/${name}`;
function hasCommand(groups, command) {
    // Match by binary name substring so both old exact-path and new guarded forms are detected.
    const binName = command.match(/node_modules\/\.bin\/([\w-]+)/)?.[1];
    return groups.some((g) => g.hooks.some((h) => {
        if (h.command === command)
            return true;
        if (binName && commandInvokesBin(h.command, binName))
            return true;
        return false;
    }));
}
function commandInvokesBin(command, binName) {
    const escaped = binName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const binPattern = new RegExp(`node_modules/\\.bin/${escaped}(?=$|["'\\s])`, 'u');
    return binPattern.test(command);
}
function ensureGroup(groups, group) {
    if (hasCommand(groups, group.hooks[0].command))
        return groups;
    return [...groups, group];
}
function orderStopGroups(groups) {
    return [...groups].sort((left, right) => {
        const leftCommand = left.hooks[0]?.command ?? '';
        const rightCommand = right.hooks[0]?.command ?? '';
        const leftIsGlobalStop = leftCommand.includes('ak-stop-qa');
        const rightIsGlobalStop = rightCommand.includes('ak-stop-qa');
        if (leftIsGlobalStop === rightIsGlobalStop)
            return 0;
        return leftIsGlobalStop ? 1 : -1;
    });
}
function stripSkillManagedHooks(groups) {
    return (groups ?? [])
        .map((group) => ({
        ...group,
        hooks: group.hooks.filter((hook) => !isTaggedSkillHook(hook.command)),
    }))
        .filter((group) => group.hooks.length > 0);
}
function materializeClaudeSkillCommand(skillHook) {
    const tag = buildSkillTag(skillHook.skillName);
    if (skillHook.command.startsWith('ak ')) {
        const args = skillHook.command.slice(3);
        return `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" ${args} || true ${tag}`;
    }
    return `${skillHook.command} ${tag}`;
}
function mergeSkillHooks(hooks, skillHooks) {
    const nextHooks = Object.fromEntries(Object.entries(hooks).map(([event, groups]) => [event, stripSkillManagedHooks(groups)]));
    for (const skillHook of skillHooks) {
        const groups = nextHooks[skillHook.event] ?? [];
        nextHooks[skillHook.event] = ensureGroup(groups, {
            ...(skillHook.matcher ? { matcher: skillHook.matcher } : {}),
            hooks: [
                {
                    type: 'command',
                    command: materializeClaudeSkillCommand(skillHook),
                    ...(skillHook.timeout ? { timeout: skillHook.timeout } : {}),
                },
            ],
        });
    }
    return nextHooks;
}
// ── Claude Code (.claude/settings.json) ──────────────────────────────────────
function patchClaudeSettings(existing, skillHooks) {
    const mergedHooks = mergeSkillHooks((existing.hooks ?? {}), skillHooks);
    const worktree = existing.worktree;
    const symlinkDirectories = Array.isArray(worktree?.symlinkDirectories)
        ? worktree?.symlinkDirectories.filter((value) => typeof value === 'string')
        : [];
    const normalizedSymlinkDirectories = symlinkDirectories.includes('.claude')
        ? symlinkDirectories
        : [...symlinkDirectories, '.claude'];
    return {
        ...existing,
        worktree: {
            ...worktree,
            symlinkDirectories: normalizedSymlinkDirectories,
        },
        hooks: {
            ...mergedHooks,
            SessionStart: ensureGroup(ensureGroup(mergedHooks.SessionStart ?? [], {
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
            // Keep the centralized ak-* hooks session-wide. Skill hooks are scoped
            // to a skill lifecycle and are not a substitute for these guardrails.
            PreToolUse: ensureGroup(ensureGroup(mergedHooks.PreToolUse ?? [], {
                matcher: 'Bash|Write|Edit|MultiEdit',
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
            PostToolUse: ensureGroup(mergedHooks.PostToolUse ?? [], {
                matcher: 'Write|Edit|MultiEdit',
                hooks: [{ type: 'command', command: CC_BIN('ak-post-tool'), timeout: 15 }],
            }),
            UserPromptSubmit: ensureGroup(mergedHooks.UserPromptSubmit ?? [], {
                hooks: [{ type: 'command', command: CC_BIN('ak-guard-switch'), timeout: 5 }],
            }),
            Stop: orderStopGroups(ensureGroup(mergedHooks.Stop ?? [], {
                hooks: [{ type: 'command', command: CC_BIN('ak-stop-qa') }],
            })),
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
function ensureGstackHooks(repoRoot, options = {}) {
    if (options.dryRun)
        return;
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
    ensureGstackHooks(input.repoRoot, input.options);
    const skillHooks = extractSkillHooks(join(input.repoRoot, '.agent', 'skills'));
    return {
        claude: patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), (existing) => patchClaudeSettings(existing, skillHooks), input.options),
        codex: patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), patchCodexHooks, input.options),
    };
}
//# sourceMappingURL=index.js.map