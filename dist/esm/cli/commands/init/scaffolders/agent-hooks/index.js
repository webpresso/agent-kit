/**
 * `agent-hooks` scaffolder — wires wp-* hooks into:
 *   - `.claude/settings.json` (Claude Code)
 *   - `.codex/hooks.json` (Codex CLI)
 *
 * Additive: never removes existing hooks, only ensures agent-kit's entries
 * are present. Uses installed bin paths so consumers don't need bun.
 *
 * Runs by default on every `wp setup`.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { patchJsonFile } from '#cli/commands/init/merge';
import { CodexAppServerClient } from '#codex/app-server/client.js';
import { isPresetOwnedGlobalCodexHook } from './codex-global-ownership.js';
import { syncCodexHookTrustWithAppServer, } from './codex-trust-sync.js';
import { buildSkillTag, extractSkillHooks, isTaggedSkillHook, } from './skill-hooks.js';
// Claude Code uses $CLAUDE_PROJECT_DIR. Codex hook runners can execute while the
// active session cwd points at a sibling repo, so Codex hook commands must be
// path-stable and not depend on the caller's cwd.
//
// CC_BIN wraps the command in a guard so it exits 0 gracefully when node_modules
// hasn't been installed yet (e.g. a fresh worktree before `vp install` completes).
// Without the guard every hook fires an error on first session start in new worktrees.
const CC_BIN = (name) => `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`;
const CODEX_BIN = (repoRoot) => (name) => {
    const binPath = resolve(repoRoot, 'node_modules', '.bin', name);
    return `[ -x "${binPath}" ] && "${binPath}" || true`;
};
// Canonical hook event names recognised by both Claude Code and Codex CLI.
// Used by `hoistTopLevelEvents` to identify legacy flat-form keys to migrate.
const HOOK_EVENT_NAMES = [
    'SessionStart',
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'Stop',
];
/**
 * Detect whether `groups` already contain a hook that invokes the same target
 * as `command`. The "target" is whatever uniquely identifies the script being
 * launched, regardless of shell-wrapping (e.g. `[ -x X ] && X || true` vs the
 * raw `X` invocation).
 *
 * Two extractors run in order; the first match wins:
 *   1. `node_modules/.bin/<name>` — installed bin (existing precedent).
 *   2. `<basename>.<sh|ts|js|mjs|cjs|py>` — script file (covers
 *      `.claude/hooks/check-gstack-session.sh`, `bun apps/scripts/foo.ts`,
 *      etc.). Both wrapped and raw forms map to the same basename so dedup
 *      catches them.
 *
 * Falls back to exact-string match when neither extractor applies.
 */
function hasCommand(groups, command) {
    const targetId = extractCommandTarget(command);
    return groups.some((g) => g.hooks.some((h) => {
        if (h.command === command)
            return true;
        if (targetId !== null && extractCommandTarget(h.command) === targetId)
            return true;
        return false;
    }));
}
const SCRIPT_EXTENSIONS = ['sh', 'ts', 'js', 'mjs', 'cjs', 'py'];
const DIRECT_NODE_MODULES_BIN_PATTERN = /^(?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+)$/u;
const GUARDED_NODE_MODULES_BIN_PATTERN = /^\[ -x (["']?)((?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+))\1 \] && \1\2\1 \|\| true$/u;
const LEGACY_AGENT_KIT_BIN_PATTERN = /run-agent-kit-bin\.ts"\s+(wp-[\w-]+)(?=$|["'\s])/u;
// Capture the basename of any path that ends in a known script extension.
// Handles trailing chars (quote, space, end-of-string).
const SCRIPT_BASENAME_PATTERN = new RegExp(String.raw `([\w-]+\.(?:${SCRIPT_EXTENSIONS.join('|')}))(?=$|["'\s])`, 'u');
function extractAgentKitCodexBinName(command) {
    const normalizedCommand = stripSingleShellQuotePair(command.trim());
    const directBinMatch = DIRECT_NODE_MODULES_BIN_PATTERN.exec(normalizedCommand);
    if (directBinMatch !== null)
        return directBinMatch[1] ?? null;
    const guardedBinMatch = GUARDED_NODE_MODULES_BIN_PATTERN.exec(command.trim());
    if (guardedBinMatch !== null)
        return guardedBinMatch[3] ?? null;
    const legacyRunnerMatch = LEGACY_AGENT_KIT_BIN_PATTERN.exec(command);
    return legacyRunnerMatch?.[1] ?? null;
}
function stripSingleShellQuotePair(value) {
    if (value.length < 2)
        return value;
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return value.slice(1, -1);
    }
    return value;
}
/**
 * Return a stable identifier for the script that `command` invokes, or null
 * when none can be extracted (e.g. an opaque shell expression). Used by
 * `hasCommand` for dedup across wrapped/raw invocation forms.
 */
function extractCommandTarget(command) {
    const binName = extractAgentKitCodexBinName(command);
    if (binName !== null)
        return `bin:${binName}`;
    const scriptMatch = SCRIPT_BASENAME_PATTERN.exec(command);
    if (scriptMatch !== null)
        return `script:${scriptMatch[1]}`;
    return null;
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
        const leftIsGlobalStop = leftCommand.includes('wp-stop-qa');
        const rightIsGlobalStop = rightCommand.includes('wp-stop-qa');
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
    if (skillHook.command.startsWith('wp ')) {
        const args = skillHook.command.slice(3);
        return `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/wp" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/wp" ${args} || true ${tag}`;
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
// ── Shared agent-kit hook construction ───────────────────────────────────────
/**
 * Construct the canonical 5 wp-* hook groups (SessionStart, PreToolUse,
 * PostToolUse, UserPromptSubmit, Stop). Single source of truth — adding a
 * new wp-* hook is one append here and propagates to both surfaces.
 */
export function buildAgentKitHookGroups(input) {
    const { resolveBin, matchers } = input;
    return {
        SessionStart: [
            {
                hooks: [{ type: 'command', command: resolveBin('wp-sessionstart-routing'), timeout: 5 }],
            },
            {
                hooks: [{ type: 'command', command: resolveBin('wp-check-dev-link'), timeout: 5 }],
            },
        ],
        PreToolUse: [
            {
                matcher: matchers.preToolUse,
                hooks: [{ type: 'command', command: resolveBin('wp-pretool-guard'), timeout: 5 }],
            },
        ],
        PostToolUse: [
            {
                matcher: matchers.postToolUse,
                hooks: [{ type: 'command', command: resolveBin('wp-post-tool'), timeout: 15 }],
            },
        ],
        UserPromptSubmit: [
            {
                hooks: [{ type: 'command', command: resolveBin('wp-guard-switch'), timeout: 5 }],
            },
        ],
        Stop: [
            {
                hooks: [{ type: 'command', command: resolveBin('wp-stop-qa') }],
            },
        ],
    };
}
function mergeAgentKitGroups(existing, addition) {
    const result = { ...existing };
    for (const [event, groups] of Object.entries(addition)) {
        let target = result[event] ?? [];
        for (const group of groups) {
            target = ensureGroup(target, group);
        }
        result[event] = target;
    }
    return result;
}
function normalizeCodexAgentKitCommands(hooks, repoRoot) {
    const normalized = {};
    for (const [event, groups] of Object.entries(hooks)) {
        normalized[event] = groups.reduce((dedupedGroups, group) => {
            const nextGroup = {
                ...group,
                hooks: group.hooks.map((hook) => {
                    const command = hook.command;
                    if (typeof command !== 'string')
                        return hook;
                    const binName = extractAgentKitCodexBinName(command);
                    if (binName === null)
                        return hook;
                    return {
                        ...hook,
                        command: CODEX_BIN(repoRoot)(binName),
                    };
                }),
            };
            return ensureGroup(dedupedGroups, nextGroup);
        }, []);
    }
    return normalized;
}
/**
 * Migration: Codex's canonical hooks.json schema is wrapped under a top-level
 * `hooks` key (matching Codex's official docs at
 * https://developers.openai.com/codex/hooks). Earlier versions of this
 * scaffolder wrote event keys at the top level, which Codex silently ignored.
 *
 * Move any top-level `SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|Stop`
 * keys into `json.hooks`, deduping via `ensureGroup`, and delete the
 * legacy top-level keys. Idempotent.
 */
export function hoistTopLevelEvents(json) {
    const next = { ...json };
    const wrapped = { ...(next.hooks ?? {}) };
    let changed = false;
    for (const event of HOOK_EVENT_NAMES) {
        const top = next[event];
        if (!Array.isArray(top))
            continue;
        const topGroups = top;
        let merged = wrapped[event] ?? [];
        for (const group of topGroups) {
            if (group?.hooks?.[0]?.command) {
                merged = ensureGroup(merged, group);
            }
        }
        wrapped[event] = merged;
        delete next[event];
        changed = true;
    }
    if (changed || next.hooks)
        next.hooks = wrapped;
    return next;
}
// ── Claude Code (.claude/settings.json) ──────────────────────────────────────
const CLAUDE_MATCHERS = {
    preToolUse: 'Bash|Write|Edit|MultiEdit',
    postToolUse: 'Write|Edit|MultiEdit',
};
const AGENT_KIT_CLAUDE_PLUGIN_ID = 'agent-kit@agent-kit';
function defaultClaudeUserSettingsPath() {
    return join(process.env.HOME || homedir(), '.claude', 'settings.json');
}
function patchClaudeUserSettings(existing) {
    const next = { ...existing };
    const enabledPluginsValue = next.enabledPlugins;
    const enabledPlugins = enabledPluginsValue &&
        typeof enabledPluginsValue === 'object' &&
        !Array.isArray(enabledPluginsValue)
        ? { ...enabledPluginsValue }
        : {};
    enabledPlugins[AGENT_KIT_CLAUDE_PLUGIN_ID] = true;
    next.enabledPlugins = enabledPlugins;
    if (next.disableAllHooks === true) {
        next.disableAllHooks = false;
    }
    return next;
}
function patchClaudeSettings(existing, skillHooks) {
    const withSkills = mergeSkillHooks((existing.hooks ?? {}), skillHooks);
    const agentKit = buildAgentKitHookGroups({
        resolveBin: CC_BIN,
        matchers: CLAUDE_MATCHERS,
    });
    const merged = mergeAgentKitGroups(withSkills, agentKit);
    // Claude-only extras: gstack soft-warning at SessionStart (non-blocking)
    // and a Skill-matcher PreToolUse hook for stricter enforcement.
    const withClaudeExtras = {
        ...merged,
        SessionStart: ensureGroup(merged.SessionStart ?? [], {
            hooks: [
                {
                    type: 'command',
                    command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack-session.sh"',
                    timeout: 2,
                },
            ],
        }),
        PreToolUse: ensureGroup(merged.PreToolUse ?? [], {
            matcher: 'Skill',
            hooks: [
                {
                    type: 'command',
                    command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack.sh"',
                    timeout: 3,
                },
            ],
        }),
        Stop: orderStopGroups(merged.Stop ?? []),
    };
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
        hooks: withClaudeExtras,
    };
}
// ── Codex CLI (.codex/hooks.json) ────────────────────────────────────────────
// Schema is wrapped under top-level `hooks` (Codex docs: developers.openai.com/codex/hooks).
// File edits go through apply_patch; "Edit"/"Write" are accepted matcher aliases.
const CODEX_MATCHERS = {
    preToolUse: 'Bash|Edit|Write',
    postToolUse: 'Edit|Write',
};
function patchCodexHooks(existing, repoRoot) {
    const migrated = hoistTopLevelEvents(existing);
    const existingHooks = normalizeCodexAgentKitCommands((migrated.hooks ?? {}), repoRoot);
    const agentKit = buildAgentKitHookGroups({
        resolveBin: CODEX_BIN(repoRoot),
        matchers: CODEX_MATCHERS,
    });
    return {
        ...migrated,
        hooks: mergeAgentKitGroups(existingHooks, agentKit),
    };
}
function reportCodexTrustSyncWarning(input, warning) {
    input.onCodexTrustSyncWarning?.(warning);
    console.warn(`  codex hook trust: warning — ${warning.message}. Review in /hooks.`);
}
export async function trustCodexAgentKitHooksForRepo(input) {
    if (input.options.dryRun || process.env.WP_SKIP_CODEX_TRUST_SYNC === '1')
        return;
    const hooksPath = resolve(input.repoRoot, '.codex', 'hooks.json');
    if (!existsSync(hooksPath))
        return;
    const createCodexAppServer = input.createCodexAppServer ?? ((repoRoot) => CodexAppServerClient.start({ cwd: repoRoot }));
    let api;
    try {
        api = await createCodexAppServer(input.repoRoot);
    }
    catch (error) {
        reportCodexTrustSyncWarning(input, {
            kind: 'codex-app-server-trust-sync-warning',
            message: error instanceof Error ? error.message : String(error),
        });
        return;
    }
    try {
        const syncResult = await syncCodexHookTrustWithAppServer(api, { repoRoot: input.repoRoot });
        if (!syncResult.ok && syncResult.reason !== 'no-agent-kit-hooks-found') {
            reportCodexTrustSyncWarning(input, {
                kind: 'codex-app-server-trust-sync-warning',
                message: syncResult.message,
                syncResult,
            });
        }
    }
    finally {
        await api.close();
    }
}
export async function trustCodexPresetHooksForUser(input) {
    if (input.options.dryRun || process.env.WP_SKIP_CODEX_TRUST_SYNC === '1')
        return;
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    const hooksPath = resolve(codexHome, 'hooks.json');
    if (!existsSync(hooksPath))
        return;
    const createCodexAppServer = input.createCodexAppServer ?? ((repoRoot) => CodexAppServerClient.start({ cwd: repoRoot }));
    let api;
    try {
        api = await createCodexAppServer(input.repoRoot);
    }
    catch (error) {
        reportCodexTrustSyncWarning(input, {
            kind: 'codex-app-server-trust-sync-warning',
            message: error instanceof Error ? error.message : String(error),
        });
        return;
    }
    try {
        const syncResult = await syncCodexHookTrustWithAppServer(api, {
            repoRoot: input.repoRoot,
            expectedSourcePaths: [hooksPath],
            hookDescription: 'preset-owned global',
            selectHook: isPresetOwnedGlobalCodexHook,
        });
        if (!syncResult.ok && syncResult.reason !== 'no-agent-kit-hooks-found') {
            reportCodexTrustSyncWarning(input, {
                kind: 'codex-app-server-trust-sync-warning',
                message: syncResult.message,
                syncResult,
            });
        }
    }
    finally {
        await api.close();
    }
}
// Fast existence check — no network, no install, sub-10ms.
// Installation is handled by `wp setup` (gstack scaffolder runs by default).
const GSTACK_CHECK_SH = `#!/bin/sh
if [ -d "$HOME/.claude/skills/gstack/bin" ]; then
  exit 0
fi
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"gstack is not installed. Fix: run \`wp setup\` then restart Claude Code."}}\\n'
`;
// SessionStart soft warning — emits additionalContext, never blocks.
const GSTACK_SESSION_SH = `#!/bin/sh
if [ -d "$HOME/.claude/skills/gstack/bin" ]; then
  exit 0
fi
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"WARNING: gstack is not installed. Skills like /browse, /qa, /ship are unavailable. Fix: run \`wp setup\` then restart."}}\n'
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
export async function scaffoldAgentHooks(input) {
    ensureGstackHooks(input.repoRoot, input.options);
    const skillHooks = extractSkillHooks(join(input.repoRoot, '.agent', 'skills'));
    const result = {
        claude: patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), (existing) => patchClaudeSettings(existing, skillHooks), input.options),
        codex: patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), (existing) => patchCodexHooks(existing, input.repoRoot), input.options),
        claudeUser: patchJsonFile(defaultClaudeUserSettingsPath(), (existing) => patchClaudeUserSettings(existing), input.options),
    };
    if (input.trustCodexHooks !== false) {
        await trustCodexAgentKitHooksForRepo(input);
    }
    return result;
}
//# sourceMappingURL=index.js.map