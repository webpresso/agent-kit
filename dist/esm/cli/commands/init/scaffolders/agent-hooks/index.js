/**
 * `agent-hooks` scaffolder — wires wp-* hooks into:
 *   - `.claude/settings.json` (Claude Code)
 *   - `.codex/hooks.json` (Codex CLI)
 *
 * Mostly additive: preserves unrelated hooks and ensures webpresso's direct
 * `wp hook <name>` entries are present. Uses the installed package root and
 * current Node binary so consumers don't need bun or generated hook shims.
 *
 * Runs by default on every `wp setup`.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { isHookName } from '#cli/commands/hook.js';
import { patchJsonFile } from '#cli/commands/init/merge';
import { resolveAgentKitPackageRootOrThrow, } from '#cli/commands/init/package-root';
import { CodexAppServerClient } from '#codex/app-server/client.js';
import { commandExists as defaultCommandExists, pathCandidates } from '#runtime/command-exists.js';
import { CLAUDE_PLUGIN_ID } from '#cli/commands/init/scaffolders/claude-plugin/index.js';
import { hookCommandEnvPrefix, sourceRepoHooksMustForceSource, } from '#cli/commands/init/source-repo-hook-policy.js';
import { syncCodexHookTrustWithAppServer, } from './codex-trust-sync.js';
import { buildSkillTag, extractSkillHooks, isTaggedSkillHook, } from './skill-hooks.js';
import { buildClaudeHookGroups } from './emitters/claude.js';
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
const PRETOOL_GUARD_MISSING_DENY = `printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"wp not found on PATH. Install with vp install -g @webpresso/agent-kit and re-run wp setup."}}'`;
const JSON_ONLY_HOOK_FALLBACK = `printf '%s\\n' '{}'`;
function quoteShell(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
function resolveWpHookLauncherPath() {
    return resolve(resolvePackageRootForHookLaunchers(), 'bin', 'wp');
}
function resolveNodeForHookLauncher() {
    if (basename(process.execPath).startsWith('node'))
        return process.execPath;
    return pathCandidates('node').find((candidate) => existsSync(candidate)) ?? process.execPath;
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
function hookSubcommandForRequired(binName) {
    const hookName = hookSubcommandFor(binName);
    if (hookName === undefined) {
        throw new Error(`No wp hook subcommand registered for ${binName}`);
    }
    return hookName;
}
function buildDirectWpHookCommand(repoRoot, name) {
    const wpPath = quoteShell(resolveWpHookLauncherPath());
    const nodePath = quoteShell(resolveNodeForHookLauncher());
    const repoRootPath = quoteShell(repoRoot);
    const hookName = hookSubcommandForRequired(name);
    const fallback = missingLauncherFallbackCommand(name);
    const envPrefix = hookCommandEnvPrefix(repoRoot);
    return `if [ -x ${nodePath} ] && [ -f ${wpPath} ]; then (cd ${repoRootPath} && ${envPrefix}${nodePath} ${wpPath} hook ${hookName}); status=$?; if [ "$status" -eq 2 ]; then exit 2; elif [ "$status" -ne 0 ]; then ${fallback}; fi; else ${fallback}; fi # ${name}`;
}
const CC_BIN = (repoRoot) => (name) => buildDirectWpHookCommand(repoRoot, name);
const CODEX_BIN = (repoRoot) => (name) => buildDirectWpHookCommand(repoRoot, name);
// HookGroup, HooksMap, HOOK_EVENT_NAMES are imported from ./ir.js
// MatcherSet is re-exported from ./ir.js (export type above)
// ensureGroup, mergeAgentKitGroups are imported from ./merge.js
// Derived from the WP_HOOK_BIN_NAMES single source of truth (ir.ts).
const WEBPRESSO_HOOK_BIN_NAMES = new Set(WP_HOOK_BIN_NAMES);
const LEGACY_MANAGED_ONLY_HOOK_FILES = new Set([
    'wp-check-dev-link.sh',
    'wp-global-codex-omx-hook.sh',
    'wp-global-codex-omx-json-hook.sh',
]);
const LEGACY_MANAGED_HOOK_DIRECTORY_SEGMENTS = [
    '.codex/managed-hooks',
    '.claude/hooks/managed',
];
const LEGACY_MANAGED_ONLY_HOOK_PATHS = [
    '.codex/managed-hooks/wp-check-dev-link.sh',
    '.codex/managed-hooks/wp-global-codex-omx-hook.sh',
    '.codex/managed-hooks/wp-global-codex-omx-json-hook.sh',
];
export function classifyWebpressoHookBin(binName) {
    if (binName === null)
        return null;
    return WEBPRESSO_HOOK_BIN_NAMES.has(binName) ? { kind: 'canonical', binName } : null;
}
function extractAgentKitCodexBinName(command) {
    return extractWpHookCommandBinName(command) ?? extractOwnedLegacyManagedHookBinName(command);
}
function extractClaudeBinName(command) {
    return extractWpHookCommandBinName(command) ?? extractOwnedLegacyManagedHookBinName(command);
}
function extractWpHookCommandBinName(command) {
    const match = /\bwp["']?\s+hook\s+([a-z0-9-]+)/u.exec(command);
    const subcommand = match?.[1];
    if (subcommand && isHookName(subcommand)) {
        const binName = `wp-${subcommand}`;
        if (WEBPRESSO_HOOK_BIN_NAMES.has(binName))
            return binName;
    }
    const isLegacyManagedWrapper = command.includes('/.codex/managed-hooks/') || command.includes('/.claude/hooks/managed/');
    if (isLegacyManagedWrapper) {
        for (const binName of WEBPRESSO_HOOK_BIN_NAMES) {
            if (command.includes(binName))
                return binName;
        }
    }
    return null;
}
function extractOwnedLegacyManagedHookBinName(command) {
    const match = new RegExp(`(?:${LEGACY_MANAGED_HOOK_DIRECTORY_SEGMENTS.map((segment) => escapeRegExp(segment)).join('|')})\\/(wp-[a-z0-9-]+)\\.sh\\b`, 'u').exec(command);
    const binName = match?.[1];
    return binName && WEBPRESSO_HOOK_BIN_NAMES.has(binName) ? binName : null;
}
function isLegacyManagedOnlyHookCommand(command) {
    return LEGACY_MANAGED_ONLY_HOOK_PATHS.some((filePath) => command.includes(filePath));
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
        const verb = args.split(/\s+/u)[0]?.replaceAll(/[^\w-]/gu, '') || 'hook';
        return `if command -v wp >/dev/null 2>&1; then wp ${args}${stdoutPolicy}; else echo "webpresso: skill hook (wp ${verb}) skipped: global wp not found; install with vp install -g @webpresso/agent-kit and re-run wp setup" >&2; fi ${tag}`;
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
function normalizeCodexAgentKitCommands(hooks) {
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
                    if (classification === null && !isLegacyManagedOnlyHookCommand(command))
                        return hook;
                    return [];
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
                    if (classification === null && !isLegacyManagedOnlyHookCommand(command))
                        return hook;
                    return [];
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
const CLAUDE_CONTEXT_HEAVY_MATCHER = 'Bash|Read|Grep|WebFetch|Agent|Write|Edit|MultiEdit|mcp__.*';
const CLAUDE_MATCHERS = {
    preToolUse: CLAUDE_CONTEXT_HEAVY_MATCHER,
    postToolUse: CLAUDE_CONTEXT_HEAVY_MATCHER,
};
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
    enabledPlugins[CLAUDE_PLUGIN_ID] = true;
    next.enabledPlugins = enabledPlugins;
    if (next.disableAllHooks === true) {
        next.disableAllHooks = false;
    }
    return next;
}
function patchClaudeSettings(existing, repoRoot, skillHooks) {
    const existingHooks = normalizeClaudeAgentKitCommands((existing.hooks ?? {}));
    // Strip stale skill-managed hooks from existing before merging; current
    // skill hooks are re-added by buildManagedClaudeHooks below.
    const cleanedExistingHooks = mergeSkillHooks(existingHooks, []);
    const merged = mergeAgentKitGroups(cleanedExistingHooks, buildManagedClaudeHooks(repoRoot, skillHooks));
    return withClaudeWorktreeSettings(existing, {
        ...merged,
        Stop: orderStopGroups(merged.Stop ?? []),
    });
}
function withClaudeWorktreeSettings(existing, hooks) {
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
// routing visible to the guard so bounded shell wrappers that wrap quality
// commands are denied before execution instead of silently bypassing wp_* MCPs.
// File edits go through apply_patch; "Edit"/"Write" are accepted matcher aliases.
const CODEX_MATCHERS = {
    preToolUse: 'Bash|apply_patch|Edit|Write|mcp__.*',
    postToolUse: 'Bash|apply_patch|Edit|Write|mcp__.*',
};
function patchCodexHooks(existing, repoRoot) {
    const migrated = hoistTopLevelEvents(existing);
    const existingHooks = normalizeCodexAgentKitCommands((migrated.hooks ?? {}));
    return {
        ...migrated,
        hooks: mergeAgentKitGroups(existingHooks, buildManagedCodexHooks(repoRoot)),
    };
}
const SOURCE_REPO_JIT_HOOK_TIMEOUT_SECONDS = 20;
function withSourceRepoJitTimeouts(repoRoot, hooks) {
    if (!sourceRepoHooksMustForceSource(repoRoot))
        return hooks;
    return Object.fromEntries(Object.entries(hooks).map(([event, groups]) => [
        event,
        groups.map((group) => ({
            ...group,
            hooks: group.hooks.map((hook) => ({
                ...hook,
                // ponytail: source/JIT cold starts are slower; consumer runtime timeouts stay unchanged.
                timeout: Math.max(hook.timeout ?? 0, SOURCE_REPO_JIT_HOOK_TIMEOUT_SECONDS),
            })),
        })),
    ]));
}
function buildManagedClaudeHooks(repoRoot, skillHooks) {
    const withSkills = mergeSkillHooks({}, skillHooks);
    const webpresso = withSourceRepoJitTimeouts(repoRoot, buildWebpressoHookGroups({
        resolveBin: CC_BIN(repoRoot),
        matchers: CLAUDE_MATCHERS,
    }));
    const merged = mergeAgentKitGroups(withSkills, webpresso);
    return {
        ...merged,
        Stop: orderStopGroups(merged.Stop ?? []),
    };
}
function buildManagedCodexHooks(repoRoot) {
    return withSourceRepoJitTimeouts(repoRoot, buildWebpressoHookGroups({
        resolveBin: CODEX_BIN(repoRoot),
        matchers: CODEX_MATCHERS,
    }));
}
export function buildManagedHooksManifest(repoRoot, vendorState = { claude: 'enabled', codex: 'enabled' }) {
    const skillHooks = extractSkillHooks(join(repoRoot, '.agent', 'skills'));
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        claude: buildManagedClaudeHooks(repoRoot, skillHooks),
        codex: buildManagedCodexHooks(repoRoot),
        vendorState,
    };
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
    console.warn(`  codex hook trust: warning — ${warning.message} (review .codex/hooks.json)`);
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
function isCodexCliAvailable(input) {
    const commandExists = input.codexAvailable ?? (input.createCodexAppServer ? () => true : defaultCommandExists);
    return commandExists('codex');
}
function codexTrustSkipReason(input) {
    if (input.options.dryRun)
        return 'dry-run';
    if (process.env.WP_SKIP_CODEX_TRUST_SYNC === '1')
        return 'env-disabled';
    if (process.env.VITEST === 'true' && !input.createCodexAppServer && !input.codexAvailable) {
        return 'vitest-no-seam';
    }
    // Resolve availability exactly once — the injected seam may have side effects.
    if (!isCodexCliAvailable(input))
        return 'codex-unavailable';
    return null;
}
function shouldSkipCodexTrustSync(input) {
    const reason = codexTrustSkipReason(input);
    if (reason === 'codex-unavailable') {
        console.warn('  codex not detected on PATH — skipping codex hook trust (run wp setup again after installing codex)');
    }
    return reason !== null;
}
function disableClaudeHooksFromManifest(existing, manifest) {
    const existingHooks = normalizeClaudeAgentKitCommands((existing.hooks ?? {}));
    return withClaudeWorktreeSettings(existing, removeManagedHooks(existingHooks, manifest.claude));
}
function disableCodexHooksFromManifest(existing, repoRoot, manifest) {
    const migrated = hoistTopLevelEvents(existing);
    const existingHooks = normalizeCodexAgentKitCommands((migrated.hooks ?? {}));
    return {
        ...migrated,
        hooks: removeManagedHooks(existingHooks, manifest.codex),
    };
}
export function restoreManagedHooksFromManifest(input, _manifest, vendors = ['claude', 'codex']) {
    // Rebuild managed hooks from current repo truth rather than replaying the
    // stored manifest: an old manifest may carry retired wrapper commands
    // (.codex/managed-hooks/…) that must not be re-materialized on restore.
    const skillHooks = extractSkillHooks(join(input.repoRoot, '.agent', 'skills'));
    const result = {};
    if (vendors.includes('claude')) {
        result.claude = patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), (existing) => patchClaudeSettings(existing, input.repoRoot, skillHooks), input.options);
    }
    if (vendors.includes('codex')) {
        result.codex = patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), (existing) => patchCodexHooks(existing, input.repoRoot), input.options);
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
export function resolvePackageRootForHookLaunchers(options = {}) {
    return resolveAgentKitPackageRootOrThrow('wp setup: could not locate @webpresso/agent-kit package root for hook launchers.', options);
}
/**
 * The `wp hook <sub>` subcommand maps each catalogued `wp-*` hook bin to the
 * direct CLI subcommand generated into host hook config.
 */
export function hookSubcommandFor(binName) {
    const sub = binName.startsWith('wp-') ? binName.slice(3) : binName;
    return isHookName(sub) ? sub : undefined;
}
function removeDirectoryIfEmpty(directoryPath) {
    let entries;
    try {
        entries = readdirSync(directoryPath);
    }
    catch (error) {
        // Already gone or not a directory (concurrent delete / unexpected file): nothing to prune.
        const code = error.code;
        if (code === 'ENOENT' || code === 'ENOTDIR')
            return;
        throw error;
    }
    if (entries.length > 0)
        return;
    rmSync(directoryPath, { recursive: false, force: true });
}
function pruneLegacyGeneratedHookFiles(repoRoot, directorySegments, fileNames) {
    const directoryPath = join(repoRoot, ...directorySegments);
    for (const fileName of fileNames) {
        rmSync(join(directoryPath, fileName), { force: true });
    }
    removeDirectoryIfEmpty(directoryPath);
}
function pruneLegacyManagedHookDirectories(repoRoot) {
    const managedHookFiles = WP_HOOK_BIN_NAMES.map((binName) => `${binName}.sh`);
    pruneLegacyGeneratedHookFiles(repoRoot, ['.codex', 'managed-hooks'], [...managedHookFiles, ...LEGACY_MANAGED_ONLY_HOOK_FILES]);
    pruneLegacyGeneratedHookFiles(repoRoot, ['.claude', 'hooks', 'managed'], managedHookFiles);
}
export async function scaffoldAgentHooks(input) {
    const skillHooks = extractSkillHooks(join(input.repoRoot, '.agent', 'skills'));
    const manifest = buildManagedHooksManifest(input.repoRoot);
    const result = {
        claude: patchJsonFile(join(input.repoRoot, '.claude', 'settings.json'), (existing) => patchClaudeSettings(existing, input.repoRoot, skillHooks), input.options),
        codex: patchJsonFile(join(input.repoRoot, '.codex', 'hooks.json'), (existing) => patchCodexHooks(existing, input.repoRoot), input.options),
        claudeUser: patchJsonFile(defaultClaudeUserSettingsPath(), (existing) => patchClaudeUserSettings(existing), input.options),
        manifest,
    };
    if (!input.options.dryRun) {
        pruneLegacyManagedHookDirectories(input.repoRoot);
    }
    if (input.trustCodexHooks !== false) {
        await trustCodexWebpressoHooksForRepo(input);
    }
    return result;
}
//# sourceMappingURL=index.js.map