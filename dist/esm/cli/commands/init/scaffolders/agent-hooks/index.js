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
import { normalizeGlobalCodexHooksFile, resolveInstalledOmxHookScriptPath, resolveBinaryOnPath, } from '#cli/commands/init/scaffolders/agent-hooks/codex-global-normalize';
import { isPresetOwnedGlobalCodexHook } from './codex-global-ownership.js';
import { syncCodexHookTrustWithAppServer, } from './codex-trust-sync.js';
import { buildSkillTag, extractSkillHooks, isTaggedSkillHook, } from './skill-hooks.js';
import { resolveRuntimeTarget, runtimePackageDirName } from '#build/runtime-targets.js';
import { buildClaudeHookGroups } from './emitters/claude.js';
import { DIRECT_CLAUDE_NODE_MODULES_BIN_PATTERN, DIRECT_MANAGED_HOOK_LAUNCHER_PATTERN, DIRECT_NODE_MODULES_BIN_PATTERN, GUARDED_CLAUDE_NODE_MODULES_BIN_PATTERN, GUARDED_MANAGED_HOOK_LAUNCHER_PATTERN, GUARDED_NODE_MODULES_BIN_PATTERN, stripSingleShellQuotePair, } from './shell-identity.js';
import { HOOK_EVENT_NAMES, WP_HOOK_BIN_NAMES, WP_HOOK_SPECS, } from './ir.js';
import { ensureGroup, mergeAgentKitGroups } from './merge.js';
// Claude Code uses $CLAUDE_PROJECT_DIR. Codex hook runners can execute while the
// active session cwd points at a sibling repo, so Codex hook commands must be
// path-stable and not depend on the caller's cwd.
//
// Hook command wrappers:
// - default: fail-open to keep fresh repos usable while dependencies install
// - json-only hooks: fail-open with `{}` on stdout to preserve Codex's JSON contract
// - pretool guard: fail-closed (explicit deny JSON) so policy cannot silently
//   bypass when the guard binary is missing/non-executable.
const PRETOOL_GUARD_BIN = 'wp-pretool-guard';
const PRETOOL_GUARD_MISSING_DENY = `printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"wp-pretool-guard is unavailable. Run vp install or wp setup."}}'`;
const JSON_ONLY_HOOK_FALLBACK = `printf '%s\\n' '{}'`;
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
const HOOK_SPEC_BY_BIN = new Map(WP_HOOK_SPECS.map((spec) => [spec.bin, spec]));
function isJsonOnlyHookBin(name) {
    return HOOK_SPEC_BY_BIN.get(name)?.jsonOnly === true;
}
function missingLauncherFallbackCommand(name) {
    if (isJsonOnlyHookBin(name))
        return JSON_ONLY_HOOK_FALLBACK;
    if (name === PRETOOL_GUARD_BIN)
        return PRETOOL_GUARD_MISSING_DENY;
    return 'true';
}
function buildGuardedHookCommand(binPath, name) {
    const quotedBinPath = quoteHookCommandPath(binPath);
    return `[ -x ${quotedBinPath} ] && ${quotedBinPath} || ${missingLauncherFallbackCommand(name)}`;
}
const CC_BIN = (name) => buildGuardedHookCommand(claudeManagedHookLauncherPath(name), name);
const CODEX_BIN = (repoRoot) => (name) => {
    return buildGuardedHookCommand(codexManagedHookLauncherPath(repoRoot, name), name);
};
// HookGroup, HooksMap, HOOK_EVENT_NAMES are imported from ./ir.js
// MatcherSet is re-exported from ./ir.js (export type above)
// ensureGroup, mergeAgentKitGroups are imported from ./merge.js
// Derived from the WP_HOOK_BIN_NAMES single source of truth (ir.ts). The legacy
// set is the same bins under the retired `ak-` prefix, pruned on setup.
const WEBPRESSO_HOOK_BIN_NAMES = new Set(WP_HOOK_BIN_NAMES);
const LEGACY_WEBPRESSO_HOOK_BIN_NAMES = new Set(WP_HOOK_BIN_NAMES.map((bin) => bin.replace(/^wp-/u, 'ak-')));
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
// ensureGroup and mergeAgentKitGroups are imported from ./merge.js
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
        const stdoutPolicy = skillHook.event === 'Stop' ? ' >/dev/null' : '';
        // Resolve `wp` via the project bin first, then the agent-kit package root
        // (workspace roots without a local install used to silently no-op here —
        // the Stop `wp audit agents` gate never ran). When neither resolves, warn
        // on stderr instead of swallowing the skip behind `|| true`.
        const fallbackWp = quoteShell(join(resolvePackageRootForHookLaunchers(), 'bin', 'wp'));
        const verb = args.split(/\s+/u)[0]?.replaceAll(/[^\w-]/gu, '') || 'hook';
        return `_WPSKILL="$CLAUDE_PROJECT_DIR/node_modules/.bin/wp"; [ -x "$_WPSKILL" ] || _WPSKILL=${fallbackWp}; if [ -x "$_WPSKILL" ]; then "$_WPSKILL" ${args}${stdoutPolicy}; else echo "webpresso: skill hook (wp ${verb}) skipped: wp not found; run vp install or wp setup" >&2; fi ${tag}`;
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
 * Construct the canonical wp-* hook groups (SessionStart, PreToolUse,
 * PostToolUse, UserPromptSubmit, Stop). Delegates to buildClaudeHookGroups
 * in emitters/claude.ts which reads from WP_HOOK_SPECS in ir.ts.
 *
 * Kept exported for backward compatibility — callers should prefer
 * buildClaudeHookGroups directly.
 */
export function buildWebpressoHookGroups(input) {
    return buildClaudeHookGroups(input);
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
    // Strip stale skill-managed hooks from existing before merging; current
    // skill hooks are re-added by buildManagedClaudeHooks below.
    const cleanedExistingHooks = mergeSkillHooks(existingHooks, []);
    const merged = mergeAgentKitGroups(cleanedExistingHooks, buildManagedClaudeHooks(skillHooks));
    return withClaudeWorktreeSettings(existing, {
        ...merged,
        Stop: orderStopGroups(merged.Stop ?? []),
    });
}
function withClaudeWorktreeSettings(existing, hooks) {
    // Claude-only extras: gstack soft-warning at SessionStart (non-blocking)
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
        hooks,
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
    return {
        ...migrated,
        hooks: mergeAgentKitGroups(existingHooks, buildManagedCodexHooks(repoRoot)),
    };
}
function buildManagedClaudeHooks(skillHooks) {
    const withSkills = mergeSkillHooks({}, skillHooks);
    const webpresso = buildWebpressoHookGroups({
        resolveBin: CC_BIN,
        matchers: CLAUDE_MATCHERS,
    });
    const merged = mergeAgentKitGroups(withSkills, webpresso);
    return {
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
}
function buildManagedCodexHooks(repoRoot) {
    return buildWebpressoHookGroups({
        resolveBin: CODEX_BIN(repoRoot),
        matchers: CODEX_MATCHERS,
    });
}
function collectManagedCommandSet(hooks) {
    return new Map(Object.entries(hooks).map(([event, groups]) => [
        event,
        new Set(groups.flatMap((group) => group.hooks.map((hook) => hook.command))),
    ]));
}
function removeManagedHooks(existingHooks, managedHooks) {
    const managedCommands = collectManagedCommandSet(managedHooks);
    const next = {};
    for (const [event, groups] of Object.entries(existingHooks)) {
        const commands = managedCommands.get(event);
        const filteredGroups = groups
            .map((group) => ({
            ...group,
            hooks: group.hooks.filter((hook) => !commands?.has(hook.command)),
        }))
            .filter((group) => group.hooks.length > 0);
        if (filteredGroups.length > 0) {
            next[event] = filteredGroups;
        }
    }
    return next;
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
function patchClaudeHooksFromManifest(existing, manifest) {
    const existingHooks = normalizeClaudeAgentKitCommands((existing.hooks ?? {}));
    const merged = mergeAgentKitGroups(existingHooks, manifest.claude);
    return withClaudeWorktreeSettings(existing, {
        ...merged,
        Stop: orderStopGroups(merged.Stop ?? []),
    });
}
function patchCodexHooksFromManifest(existing, repoRoot, manifest) {
    const migrated = hoistTopLevelEvents(existing);
    const existingHooks = normalizeCodexAgentKitCommands((migrated.hooks ?? {}), repoRoot);
    return {
        ...migrated,
        hooks: mergeAgentKitGroups(existingHooks, manifest.codex),
    };
}
function disableClaudeHooksFromManifest(existing, manifest) {
    const existingHooks = normalizeClaudeAgentKitCommands((existing.hooks ?? {}));
    return withClaudeWorktreeSettings(existing, removeManagedHooks(existingHooks, manifest.claude));
}
function disableCodexHooksFromManifest(existing, repoRoot, manifest) {
    const migrated = hoistTopLevelEvents(existing);
    const existingHooks = normalizeCodexAgentKitCommands((migrated.hooks ?? {}), repoRoot);
    return {
        ...migrated,
        hooks: removeManagedHooks(existingHooks, manifest.codex),
    };
}
export function restoreManagedHooksFromManifest(input, manifest, vendors = ['claude', 'codex']) {
    ensureGstackHooks(input.repoRoot, input.options);
    ensureManagedWebpressoHookLaunchers(input.repoRoot, input.options);
    const result = {};
    if (vendors.includes('claude')) {
        result.claude = patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), (existing) => patchClaudeHooksFromManifest(existing, manifest), input.options);
    }
    if (vendors.includes('codex')) {
        result.codex = patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), (existing) => patchCodexHooksFromManifest(existing, input.repoRoot, manifest), input.options);
    }
    return result;
}
export function disableManagedHooksFromManifest(input, manifest, vendors) {
    const result = {};
    if (vendors.includes('claude')) {
        result.claude = patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), (existing) => disableClaudeHooksFromManifest(existing, manifest), input.options);
    }
    if (vendors.includes('codex')) {
        result.codex = patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), (existing) => disableCodexHooksFromManifest(existing, input.repoRoot, manifest), input.options);
    }
    return result;
}
// Fast existence check — no network, no install, sub-10ms.
// Installation is handled by `wp setup` (gstack scaffolder runs by default).
// Reads the Skill tool payload from stdin and denies ONLY gstack-owned
// skills; an unconditional deny used to block every skill (webpresso, OMC,
// …) whenever gstack was missing (2026-06 audit).
const GSTACK_OWNED_SKILLS = [
    '_gstack-command',
    'autoplan',
    'benchmark',
    'benchmark-models',
    'browse',
    'canary',
    'careful',
    'codex',
    'connect-chrome',
    'context-restore',
    'context-save',
    'cso',
    'design-consultation',
    'design-html',
    'design-review',
    'design-shotgun',
    'devex-review',
    'document-generate',
    'document-release',
    'freeze',
    'gstack-upgrade',
    'guard',
    'health',
    'investigate',
    'land-and-deploy',
    'landing-report',
    'learn',
    'make-pdf',
    'office-hours',
    'pair-agent',
    'plan-ceo-review',
    'plan-design-review',
    'plan-devex-review',
    'plan-eng-review',
    'plan-tune',
    'qa',
    'qa-only',
    'retro',
    'review',
    'scrape',
    'setup-browser-cookies',
    'setup-deploy',
    'setup-gbrain',
    'ship',
    'skillify',
    'spec',
    'sync-gbrain',
    'unfreeze',
];
const GSTACK_CHECK_SH = `#!/bin/sh
if [ -d "$HOME/.claude/skills/gstack/bin" ]; then
  exit 0
fi
payload="$(cat 2>/dev/null || true)"
skill="$(printf '%s' "$payload" | sed -n 's/.*"skill"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p' | head -n 1)"
case "$skill" in
  ${GSTACK_OWNED_SKILLS.join('|')}|ios-*)
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"gstack is not installed (a gstack-owned skill was requested). Fix: run \`wp setup\` then restart Claude Code."}}\\n'
    ;;
  *)
    exit 0
    ;;
esac
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
    // Overwrite-on-change (mirrors ensureManagedWebpressoHookLaunchers) so
    // template fixes actually reach existing repos on regen — write-once kept
    // the unconditional-deny bug alive in every previously scaffolded repo.
    const gstackScripts = [
        ['check-gstack.sh', GSTACK_CHECK_SH],
        ['check-gstack-session.sh', GSTACK_SESSION_SH],
    ];
    for (const [name, content] of gstackScripts) {
        const scriptPath = join(hooksDir, name);
        if (!existsSync(scriptPath) || readFileSync(scriptPath, 'utf8') !== content) {
            writeFileSync(scriptPath, content, 'utf8');
        }
        chmodSync(scriptPath, 0o755);
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
export function hookSubcommandFor(binName) {
    const sub = binName.startsWith('wp-') ? binName.slice(3) : binName;
    return isHookName(sub) ? sub : undefined;
}
function renderManagedWebpressoHookLauncher(repoRoot, binName) {
    const nodeBinary = quoteShell(process.execPath);
    const projectBinPath = quoteShell(resolveProjectHookBinPath(repoRoot, binName));
    const fallbackBinPath = quoteShell(resolvePackageHookBin(binName));
    const missingRuntimeWarning = `echo "webpresso hook ${binName} skipped: runtime not found; run vp install or wp setup" >&2`;
    // Guard fails closed (explicit deny JSON); json-only hooks keep Codex stdout
    // parseable; every other hook warns on stderr instead of silently exiting — a
    // silently-disabled hook hid the broken node pin for weeks (2026-06 audit).
    const missingFallback = isJsonOnlyHookBin(binName)
        ? `${missingRuntimeWarning}
  ${JSON_ONLY_HOOK_FALLBACK}`
        : binName === PRETOOL_GUARD_BIN
            ? PRETOOL_GUARD_MISSING_DENY
            : missingRuntimeWarning;
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
    // Node resolution chain: pinned absolute path (survives sanitized hook
    // environments) -> `command -v node` (survives runtime version bumps that
    // stale the pin). Only after both fail does the missing-fallback fire.
    return `#!/bin/sh
${compiledPreamble}NODE_BINARY=${nodeBinary}
PROJECT_BIN_PATH=${projectBinPath}
FALLBACK_BIN_PATH=${fallbackBinPath}

if [ ! -x "$NODE_BINARY" ]; then
  NODE_BINARY="$(command -v node 2>/dev/null || true)"
fi

if [ -z "$NODE_BINARY" ] || [ ! -x "$NODE_BINARY" ]; then
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
    const manifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        claude: buildManagedClaudeHooks(skillHooks),
        codex: buildManagedCodexHooks(input.repoRoot),
        vendorState: { claude: 'enabled', codex: 'enabled' },
    };
    const result = {
        claude: patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), (existing) => patchClaudeSettings(existing, skillHooks), input.options),
        codex: patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), (existing) => patchCodexHooks(existing, input.repoRoot), input.options),
        claudeUser: patchJsonFile(defaultClaudeUserSettingsPath(), (existing) => patchClaudeUserSettings(existing), input.options),
        manifest,
    };
    const codexHooksPath = join(input.repoRoot, '.codex', 'hooks.json');
    const codexNormalization = normalizeGlobalCodexHooksFile(codexHooksPath, {
        contextModeBinary: resolveBinaryOnPath('context-mode'),
        nodeBinary: process.execPath,
        omxScriptPath: resolveInstalledOmxHookScriptPath(),
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