/**
 * `agent-hooks` scaffolder — wires wp-* hooks into:
 *   - `.claude/settings.json` (Claude Code)
 *   - `.codex/hooks.json` (Codex CLI)
 *
 * Mostly additive: preserves unrelated hooks, ensures webpresso's entries
 * are present, and prunes stale legacy Claude ak-* hook commands that current
 * setups no longer own. Uses installed bin paths so consumers don't need bun.
 *
 * Runs by default on every `wp setup`.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isHookName } from '#cli/commands/hook.js';
import { patchJsonFile } from '#cli/commands/init/merge';
import { resolveAgentKitPackageRootOrThrow, } from '#cli/commands/init/package-root';
import { CodexAppServerClient } from '#codex/app-server/client.js';
import { normalizeGlobalCodexHooksFile, resolveBinaryOnPath, } from '#cli/commands/init/scaffolders/agent-hooks/codex-global-normalize';
import { isPresetOwnedGlobalCodexHook } from './codex-global-ownership.js';
import { syncCodexHookTrustWithAppServer, } from './codex-trust-sync.js';
import { buildSkillTag, extractSkillHooks, isTaggedSkillHook, } from './skill-hooks.js';
import { resolveRuntimeTarget, runtimePackageDirName } from '#build/runtime-targets.js';
// Claude Code uses $CLAUDE_PROJECT_DIR. Codex hook runners can execute while the
// active session cwd points at a sibling repo, so Codex hook commands must be
// path-stable and not depend on the caller's cwd.
//
// Hook command wrappers:
// - default: fail-open to keep fresh repos usable while dependencies install
// - pretool guard: fail-closed (explicit deny JSON) so policy cannot silently
//   bypass when the guard binary is missing/non-executable.
const PRETOOL_GUARD_BIN = 'wp-pretool-guard';
const PRETOOL_GUARD_MISSING_DENY = `printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"wp-pretool-guard is unavailable. Run vp install or wp setup."}}'`;
const CLAUDE_MANAGED_HOOK_SUBDIR = '.claude/hooks/managed';
const CODEX_MANAGED_HOOK_SUBDIR = '.codex/managed-hooks';
function claudeManagedHookLauncherPath(name) {
    return `$CLAUDE_PROJECT_DIR/${CLAUDE_MANAGED_HOOK_SUBDIR}/${name}.sh`;
}
function codexManagedHookLauncherPath(repoRoot, name) {
    return resolve(repoRoot, CODEX_MANAGED_HOOK_SUBDIR, `${name}.sh`);
}
function quoteShell(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
function quoteHookCommandPath(value) {
    if (value.startsWith('$CLAUDE_PROJECT_DIR/'))
        return `"${value}"`;
    return quoteShell(value);
}
function buildGuardedHookCommand(binPath, name) {
    const quotedBinPath = quoteHookCommandPath(binPath);
    if (name === PRETOOL_GUARD_BIN) {
        return `[ -x ${quotedBinPath} ] && ${quotedBinPath} || ${PRETOOL_GUARD_MISSING_DENY}`;
    }
    return `[ -x ${quotedBinPath} ] && ${quotedBinPath} || true`;
}
const CC_BIN = (name) => buildGuardedHookCommand(claudeManagedHookLauncherPath(name), name);
const CODEX_BIN = (repoRoot) => (name) => {
    return buildGuardedHookCommand(codexManagedHookLauncherPath(repoRoot, name), name);
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
function commandMatches(left, right) {
    if (left === right)
        return true;
    const leftTarget = extractCommandTarget(left);
    return leftTarget !== null && extractCommandTarget(right) === leftTarget;
}
function findHookIndexByCommand(hooks, command) {
    return hooks.findIndex((hook) => commandMatches(hook.command, command));
}
const SCRIPT_EXTENSIONS = ['sh', 'ts', 'js', 'mjs', 'cjs', 'py'];
const DIRECT_NODE_MODULES_BIN_PATTERN = /^(?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+)$/u;
const GUARDED_NODE_MODULES_BIN_PATTERN = /^\[ -x (["']?)((?:\.\/|\/.*\/)?node_modules\/\.bin\/([\w-]+))\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u;
const DIRECT_CLAUDE_NODE_MODULES_BIN_PATTERN = /^["']?\$CLAUDE_PROJECT_DIR\/node_modules\/\.bin\/([\w-]+)["']?$/u;
const GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN = /^\[ -x (["']?)\$CLAUDE_PROJECT_DIR\/node_modules\/\.bin\/([\w-]+)\1 \] && \1\$CLAUDE_PROJECT_DIR\/node_modules\/\.bin\/\2\1 \|\| (?:true|printf .+)$/u;
const DIRECT_MANAGED_HOOK_LAUNCHER_PATTERN = /^(?:["']?)((?:\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/managed|(?:\.\/|\/.*\/)?\.claude\/hooks\/managed|(?:\.\/|\/.*\/)?\.codex\/managed-hooks)\/((?:wp|ak)-[\w-]+)\.sh)(?:["']?)$/u;
const GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN = /^\[ -x (["']?)((?:\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/managed|(?:\.\/|\/.*\/)?\.claude\/hooks\/managed|(?:\.\/|\/.*\/)?\.codex\/managed-hooks)\/((?:wp|ak)-[\w-]+)\.sh)\1 \] && \1\2\1 \|\| (?:true|printf .+)$/u;
// Capture the basename of any path that ends in a known script extension.
// Handles trailing chars (quote, space, end-of-string).
const SCRIPT_BASENAME_PATTERN = new RegExp(String.raw `([\w-]+\.(?:${SCRIPT_EXTENSIONS.join('|')}))(?=$|["'\s])`, 'u');
const WEBPRESSO_HOOK_BIN_NAMES = new Set([
    'wp-sessionstart-routing',
    'wp-check-dev-link',
    'wp-pretool-guard',
    'wp-post-tool',
    'wp-guard-switch',
    'wp-stop-qa',
]);
const LEGACY_WEBPRESSO_HOOK_BIN_NAMES = new Set([
    'ak-sessionstart-routing',
    'ak-check-dev-link',
    'ak-pretool-guard',
    'ak-post-tool',
    'ak-guard-switch',
    'ak-stop-qa',
]);
export function classifyWebpressoHookBin(binName) {
    if (binName === null)
        return null;
    if (WEBPRESSO_HOOK_BIN_NAMES.has(binName))
        return { kind: 'canonical', binName };
    if (LEGACY_WEBPRESSO_HOOK_BIN_NAMES.has(binName))
        return { kind: 'legacy', binName };
    return null;
}
function extractAgentKitCodexBinName(command) {
    const normalizedCommand = stripSingleShellQuotePair(command.trim());
    const directBinMatch = DIRECT_NODE_MODULES_BIN_PATTERN.exec(normalizedCommand);
    if (directBinMatch !== null)
        return directBinMatch[1] ?? null;
    const directManagedLauncherMatch = DIRECT_MANAGED_HOOK_LAUNCHER_PATTERN.exec(normalizedCommand);
    if (directManagedLauncherMatch !== null)
        return directManagedLauncherMatch[2] ?? null;
    const guardedBinMatch = GUARDED_NODE_MODULES_BIN_PATTERN.exec(command.trim());
    if (guardedBinMatch !== null)
        return guardedBinMatch[3] ?? null;
    const guardedManagedLauncherMatch = GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN.exec(command.trim());
    if (guardedManagedLauncherMatch !== null)
        return guardedManagedLauncherMatch[3] ?? null;
    return null;
}
function extractClaudeBinName(command) {
    const normalizedCommand = stripSingleShellQuotePair(command.trim());
    const directBinMatch = DIRECT_CLAUDE_NODE_MODULES_BIN_PATTERN.exec(normalizedCommand);
    if (directBinMatch !== null)
        return directBinMatch[1] ?? null;
    const directManagedLauncherMatch = DIRECT_MANAGED_HOOK_LAUNCHER_PATTERN.exec(normalizedCommand);
    if (directManagedLauncherMatch !== null)
        return directManagedLauncherMatch[2] ?? null;
    const guardedBinMatch = GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN.exec(command.trim());
    if (guardedBinMatch !== null)
        return guardedBinMatch[2] ?? null;
    const guardedManagedLauncherMatch = GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN.exec(command.trim());
    if (guardedManagedLauncherMatch !== null)
        return guardedManagedLauncherMatch[3] ?? null;
    return null;
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
    const incomingHook = group.hooks[0];
    if (!incomingHook)
        return groups;
    let changed = false;
    const nextGroups = groups.map((existingGroup) => {
        const hookIndex = findHookIndexByCommand(existingGroup.hooks, incomingHook.command);
        if (hookIndex === -1)
            return existingGroup;
        changed = true;
        const hooks = existingGroup.hooks.map((hook, index) => index === hookIndex
            ? {
                ...hook,
                ...incomingHook,
                // Preserve the consumer's already-materialized command form when
                // only the matcher/timeout changed. Codex command path migration is
                // handled by normalizeCodexAgentKitCommands before this merge.
                command: hook.command,
            }
            : hook);
        return {
            ...existingGroup,
            ...(group.matcher !== undefined ? { matcher: group.matcher } : {}),
            hooks,
        };
    });
    if (changed)
        return nextGroups;
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
// ── Shared webpresso hook construction ───────────────────────────────────────
/**
 * Construct the canonical 5 wp-* hook groups (SessionStart, PreToolUse,
 * PostToolUse, UserPromptSubmit, Stop). Single source of truth — adding a
 * new wp-* hook is one append here and propagates to both surfaces.
 */
export function buildWebpressoHookGroups(input) {
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
        const normalizedGroups = groups.reduce((dedupedGroups, group) => {
            const nextGroup = {
                ...group,
                hooks: group.hooks.flatMap((hook) => {
                    const command = hook.command;
                    if (typeof command !== 'string')
                        return hook;
                    const classification = classifyWebpressoHookBin(extractAgentKitCodexBinName(command));
                    if (classification === null)
                        return hook;
                    if (classification.kind === 'legacy')
                        return [];
                    return {
                        ...hook,
                        command: CODEX_BIN(repoRoot)(classification.binName),
                    };
                }),
            };
            if (nextGroup.hooks.length === 0)
                return dedupedGroups;
            return ensureGroup(dedupedGroups, nextGroup);
        }, []);
        if (normalizedGroups.length > 0)
            normalized[event] = normalizedGroups;
    }
    return normalized;
}
function normalizeClaudeAgentKitCommands(hooks) {
    const normalized = {};
    for (const [event, groups] of Object.entries(hooks)) {
        const normalizedGroups = groups.reduce((dedupedGroups, group) => {
            const nextGroup = {
                ...group,
                hooks: group.hooks.flatMap((hook) => {
                    const command = hook.command;
                    if (typeof command !== 'string')
                        return hook;
                    const classification = classifyWebpressoHookBin(extractClaudeBinName(command));
                    if (classification === null)
                        return hook;
                    if (classification.kind === 'legacy')
                        return [];
                    return {
                        ...hook,
                        command: CC_BIN(classification.binName),
                    };
                }),
            };
            if (nextGroup.hooks.length === 0)
                return dedupedGroups;
            return ensureGroup(dedupedGroups, nextGroup);
        }, []);
        if (normalizedGroups.length > 0)
            normalized[event] = normalizedGroups;
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
const AGENT_KIT_CLAUDE_PLUGIN_ID = 'webpresso@webpresso';
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
    const existingHooks = normalizeClaudeAgentKitCommands((existing.hooks ?? {}));
    const withSkills = mergeSkillHooks(existingHooks, skillHooks);
    const webpresso = buildWebpressoHookGroups({
        resolveBin: CC_BIN,
        matchers: CLAUDE_MATCHERS,
    });
    const merged = mergeAgentKitGroups(withSkills, webpresso);
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
// Codex can run hooks for Bash, apply_patch, and MCP tool calls. Keep MCP
// routing visible to the guard so ctx/context-mode shells that wrap quality
// commands are denied before execution instead of silently bypassing wp_* MCPs.
// File edits go through apply_patch; "Edit"/"Write" are accepted matcher aliases.
const CODEX_MATCHERS = {
    preToolUse: 'Bash|apply_patch|Edit|Write|mcp__.*',
    postToolUse: 'Edit|Write',
};
function patchCodexHooks(existing, repoRoot) {
    const migrated = hoistTopLevelEvents(existing);
    const existingHooks = normalizeCodexAgentKitCommands((migrated.hooks ?? {}), repoRoot);
    const webpresso = buildWebpressoHookGroups({
        resolveBin: CODEX_BIN(repoRoot),
        matchers: CODEX_MATCHERS,
    });
    return {
        ...migrated,
        hooks: mergeAgentKitGroups(existingHooks, webpresso),
    };
}
function reportCodexTrustSyncWarning(input, warning) {
    input.onCodexTrustSyncWarning?.(warning);
    console.warn(`  codex hook trust: warning — ${warning.message}. Review in /hooks.`);
}
export async function trustCodexWebpressoHooksForRepo(input) {
    if (shouldSkipCodexTrustSync(input))
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
        if (!syncResult.ok && syncResult.reason !== 'no-webpresso-hooks-found') {
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
    if (shouldSkipCodexTrustSync(input))
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
        if (!syncResult.ok && syncResult.reason !== 'no-webpresso-hooks-found') {
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
function shouldSkipCodexTrustSync(input) {
    if (input.options.dryRun || process.env.WP_SKIP_CODEX_TRUST_SYNC === '1')
        return true;
    return process.env.VITEST === 'true' && !input.createCodexAppServer;
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
function resolveProjectHookBinPath(repoRoot, binName) {
    return resolve(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'bin', `${binName}.js`);
}
function resolvePackageHookBin(binName) {
    return join(resolvePackageRootForHookLaunchers(), 'bin', `${binName}.js`);
}
export function resolvePackageRootForHookLaunchers(options = {}) {
    return resolveAgentKitPackageRootOrThrow('wp setup: could not locate @webpresso/agent-kit package root for hook launchers.', options);
}
function compiledRuntimePackageDir() {
    const target = resolveRuntimeTarget();
    return target ? runtimePackageDirName(target.packageName) : undefined;
}
/**
 * Absolute path to the consumer's self-contained compiled `wp` binary, when the
 * platform runtime package (`@webpresso/agent-kit-runtime-<platform>`) is
 * installed. The compiled binary bundles its own runtime, so preferring it makes
 * the hook launcher survive node-path staleness — an nvm/version change
 * invalidates the captured absolute node path but not a self-contained binary.
 * Returns undefined when no compiled runtime is installed (today's default), so
 * the launcher keeps its absolute-node fallback unchanged.
 */
function resolveCompiledWpBinary(repoRoot) {
    const packageDir = compiledRuntimePackageDir();
    if (!packageDir)
        return undefined;
    const filename = process.platform === 'win32' ? 'wp.exe' : 'wp';
    const candidate = join(repoRoot, 'node_modules', '@webpresso', packageDir, 'bin', filename);
    return existsSync(candidate) ? candidate : undefined;
}
/**
 * The `wp hook <sub>` subcommand a managed launcher should dispatch to via the
 * compiled binary, or undefined when `binName` is not a dispatchable hook (e.g.
 * `wp-check-dev-link`, which has no `wp hook` handler). The names map 1:1 by
 * stripping the `wp-` prefix; `isHookName` is the single source of truth.
 */
function hookSubcommandFor(binName) {
    const sub = binName.startsWith('wp-') ? binName.slice(3) : binName;
    return isHookName(sub) ? sub : undefined;
}
function renderManagedWebpressoHookLauncher(repoRoot, binName) {
    const nodeBinary = quoteShell(process.execPath);
    const projectBinPath = quoteShell(resolveProjectHookBinPath(repoRoot, binName));
    const fallbackBinPath = quoteShell(resolvePackageHookBin(binName));
    const missingFallback = binName === PRETOOL_GUARD_BIN ? PRETOOL_GUARD_MISSING_DENY : 'exit 0';
    // Prefer the self-contained compiled `wp` binary when it resolves: it bundles
    // its own runtime, so it is immune to the node-path staleness that would break
    // the absolute `$NODE_BINARY` path below. Only emitted for dispatchable hooks
    // with an installed compiled runtime; otherwise the node path is unchanged.
    const hookSub = hookSubcommandFor(binName);
    const compiledWp = hookSub ? resolveCompiledWpBinary(repoRoot) : undefined;
    const compiledPreamble = compiledWp !== undefined
        ? `WP_BIN=${quoteShell(compiledWp)}
if [ -x "$WP_BIN" ]; then
  exec "$WP_BIN" hook ${hookSub} "$@"
fi

`
        : '';
    return `#!/bin/sh
${compiledPreamble}NODE_BINARY=${nodeBinary}
PROJECT_BIN_PATH=${projectBinPath}
FALLBACK_BIN_PATH=${fallbackBinPath}

if [ ! -x "$NODE_BINARY" ]; then
  ${missingFallback}
  exit 0
fi

if [ -f "$PROJECT_BIN_PATH" ]; then
  exec "$NODE_BINARY" "$PROJECT_BIN_PATH" "$@"
fi

if [ -f "$FALLBACK_BIN_PATH" ]; then
  exec "$NODE_BINARY" "$FALLBACK_BIN_PATH" "$@"
fi

${missingFallback}
exit 0
`;
}
function ensureManagedWebpressoHookLaunchers(repoRoot, options = {}) {
    if (options.dryRun)
        return;
    const launcherTargets = [
        join(repoRoot, CLAUDE_MANAGED_HOOK_SUBDIR),
        join(repoRoot, CODEX_MANAGED_HOOK_SUBDIR),
    ];
    for (const directory of launcherTargets) {
        mkdirSync(directory, { recursive: true });
        for (const binName of WEBPRESSO_HOOK_BIN_NAMES) {
            const launcherPath = join(directory, `${binName}.sh`);
            const content = renderManagedWebpressoHookLauncher(repoRoot, binName);
            if (!existsSync(launcherPath) || readFileSync(launcherPath, 'utf8') !== content) {
                writeFileSync(launcherPath, content, 'utf8');
            }
            chmodSync(launcherPath, 0o755);
        }
    }
}
export async function scaffoldAgentHooks(input) {
    ensureGstackHooks(input.repoRoot, input.options);
    ensureManagedWebpressoHookLaunchers(input.repoRoot, input.options);
    const skillHooks = extractSkillHooks(join(input.repoRoot, '.agent', 'skills'));
    const result = {
        claude: patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), (existing) => patchClaudeSettings(existing, skillHooks), input.options),
        codex: patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), (existing) => patchCodexHooks(existing, input.repoRoot), input.options),
        claudeUser: patchJsonFile(defaultClaudeUserSettingsPath(), (existing) => patchClaudeUserSettings(existing), input.options),
    };
    const codexHooksPath = join(input.repoRoot, '.codex', 'hooks.json');
    const codexNormalization = normalizeGlobalCodexHooksFile(codexHooksPath, {
        contextModeBinary: resolveBinaryOnPath('context-mode'),
        nodeBinary: process.execPath,
    }, input.options);
    if ((result.codex.action === 'identical' || result.codex.action === 'created') &&
        codexNormalization.action === 'overwritten') {
        result.codex = { ...codexNormalization };
    }
    if (input.trustCodexHooks !== false) {
        await trustCodexWebpressoHooksForRepo(input);
    }
    return result;
}
//# sourceMappingURL=index.js.map