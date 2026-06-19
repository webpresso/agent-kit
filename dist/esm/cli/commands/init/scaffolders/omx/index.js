/**
 * `omx` scaffolder preset.
 *
 * Refreshes Vite+ (`vp`), ensures `omx` is installed, then chains
 * `omx setup --yes --scope user` after the webpresso scaffold completes.
 * OMX (oh-my-codex) is the operator-workflow
 * execution layer; it manages its own scaffolding idempotently.
 *
 * Required when downstream features rely on `omx team` (see
 * `cli/commands/blueprint/execution.ts`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync, } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { defaultCodexHooksPathFromConfig, normalizeGlobalCodexHooksFile, resolveInstalledOmxHookScriptPath, resolveBinaryOnPath, } from '#cli/commands/init/scaffolders/agent-hooks/codex-global-normalize';
import { appendGlobalCapableVpArgs, resolveGlobalCapableVpCommand, } from '#cli/commands/init/scaffolders/vp-global.js';
const NOT_FOUND_HINT = 'omx (oh-my-codex) is not on PATH after `vp install -g oh-my-codex`. Install it manually and re-run.';
// Quick, deterministic subprocesses (version probes, git queries) get a bound
// so a hung/wrong binary can't stall `wp setup`. The `vp install`/`vp update`/
// `omx setup` calls below are intentionally left unbounded: they are
// network/install workloads with inherited stdio where a fixed deadline would
// wrongly kill a legitimately slow run (per no-timeout-as-fix).
const PROBE_TIMEOUT_MS = 3000;
function shouldSkipManagedToolRefresh(env = process.env) {
    return env.WP_SKIP_UPDATE_CHECK === '1';
}
function defaultCodexConfigPath() {
    const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex');
    return join(codexHome, 'config.toml');
}
const OMX_PLUGIN_HOOK_COMMAND_SUFFIX = '${PLUGIN_ROOT}/hooks/codex-native-hook.mjs';
function absolutizeOmxPluginHookCommand(command, nodeBinary) {
    const trimmed = command.trim();
    if (!trimmed.includes(OMX_PLUGIN_HOOK_COMMAND_SUFFIX))
        return command;
    const match = /^node\s+(.+)$/u.exec(trimmed);
    if (match === null)
        return command;
    return `${JSON.stringify(nodeBinary)} ${match[1]}`;
}
function rewriteOmxPluginHooksJson(raw, nodeBinary) {
    const parsed = JSON.parse(raw);
    if (!parsed.hooks || typeof parsed.hooks !== 'object')
        return raw;
    let changed = false;
    const nextHooks = {};
    for (const [event, groups] of Object.entries(parsed.hooks)) {
        nextHooks[event] = (groups ?? []).map((group) => ({
            ...group,
            hooks: (group.hooks ?? []).map((hook) => {
                if (typeof hook.command !== 'string')
                    return hook;
                const nextCommand = absolutizeOmxPluginHookCommand(hook.command, nodeBinary);
                if (nextCommand !== hook.command)
                    changed = true;
                return nextCommand === hook.command ? hook : { ...hook, command: nextCommand };
            }),
        }));
    }
    if (!changed)
        return raw;
    return `${JSON.stringify({ ...parsed, hooks: nextHooks }, null, 2)}\n`;
}
function walkDirectories(root) {
    if (!existsSync(root))
        return [];
    const stack = [root];
    const directories = [];
    while (stack.length > 0) {
        const current = stack.pop();
        directories.push(current);
        let entries;
        try {
            entries = readdirSync(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            stack.push(join(current, entry.name));
        }
    }
    return directories;
}
export function repairInstalledOmxPluginHooks(codexHome, nodeBinary) {
    const cacheRoot = join(codexHome, 'plugins', 'cache');
    const repairedPaths = [];
    for (const directory of walkDirectories(cacheRoot)) {
        const hooksDir = join(directory, 'hooks');
        const hooksPath = join(hooksDir, 'hooks.json');
        const markerPath = join(hooksDir, 'omx-command.json');
        const scriptPath = join(hooksDir, 'codex-native-hook.mjs');
        if (!existsSync(hooksPath) || !existsSync(markerPath) || !existsSync(scriptPath))
            continue;
        let existing;
        try {
            existing = readFileSync(hooksPath, 'utf8');
        }
        catch {
            continue;
        }
        let next;
        try {
            next = rewriteOmxPluginHooksJson(existing, nodeBinary);
        }
        catch {
            continue;
        }
        if (next === existing)
            continue;
        mkdirSync(dirname(hooksPath), { recursive: true });
        writeFileSync(hooksPath, next, 'utf8');
        repairedPaths.push(hooksPath);
    }
    return repairedPaths;
}
/** Matches any `[hooks.state."<key>"]` TOML section header written by OMX. */
const HOOK_STATE_SECTION_RE = /^\[hooks\.state\.".+"\]$/;
/**
 * Removes ALL hook trust state blocks when duplicate `[hooks.state."..."]` keys
 * are detected.
 *
 * The TOML spec forbids duplicate keys; Codex CLI rejects the config outright.
 * Older OMX versions wrote blocks terminated by `# End OMX-owned Codex hook
 * trust state` but without a leading start marker. OMX's own
 * `stripManagedCodexHookTrustState` only strips START→END bounded blocks, so
 * legacy entries accumulate on every `wp setup` run.
 *
 * Detection contract: count unique vs total `[hooks.state."..."]` section
 * headers. If any key appears more than once the file is TOML-invalid. When
 * duplicates exist we strip all hook trust content (entries + OMX block marker
 * comments) so `omx setup --yes --scope user` can rewrite exactly one clean managed block.
 */
export function deduplicateCodexHookTrustState(config) {
    const allKeys = [...config.matchAll(/^\[hooks\.state\.".+"\]$/gm)].map((m) => m[0]);
    if (allKeys.length === new Set(allKeys).size)
        return config;
    const lines = config.split(/\r?\n/);
    const kept = [];
    let i = 0;
    while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (HOOK_STATE_SECTION_RE.test(trimmed)) {
            i += 1;
            if (i < lines.length && /^trusted_hash\s*=/.test(lines[i]?.trim() ?? '')) {
                i += 1;
            }
            continue;
        }
        // Strip OMX block-marker comment lines by prefix — resilient to minor wording changes.
        if (trimmed.startsWith('# OMX-owned Codex hook trust state') ||
            trimmed.startsWith('# End OMX-owned Codex hook trust state') ||
            trimmed === '# Trusts only setup-managed codex-native-hook.js wrappers.') {
            i += 1;
            continue;
        }
        kept.push(lines[i]);
        i += 1;
    }
    return (kept
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd() + '\n');
}
export function migrateDeprecatedCodexHooksFeatureFlag(raw) {
    const lines = raw.split(/\r?\n/);
    const featuresStart = lines.findIndex((line) => /^\s*\[features\]\s*$/.test(line));
    if (featuresStart < 0)
        return raw;
    let sectionEnd = lines.length;
    for (let i = featuresStart + 1; i < lines.length; i += 1) {
        if (/^\s*\[\[?[^\]]+\]?\]\s*$/.test(lines[i])) {
            sectionEnd = i;
            break;
        }
    }
    let hooksIdx = -1;
    let codexHooksIdx = -1;
    let codexHooksValue = 'true';
    let codexHooksIndent = '';
    for (let i = featuresStart + 1; i < sectionEnd; i += 1) {
        const line = lines[i];
        if (/^\s*hooks\s*=/.test(line)) {
            hooksIdx = i;
            continue;
        }
        const match = line.match(/^(\s*)codex_hooks\s*=\s*(.+)$/);
        if (!match)
            continue;
        codexHooksIdx = i;
        codexHooksIndent = match[1] ?? '';
        codexHooksValue = match[2] ?? 'true';
    }
    if (codexHooksIdx < 0)
        return raw;
    const replacement = `${codexHooksIndent}hooks = ${codexHooksValue}`;
    if (hooksIdx >= 0) {
        const nextLines = [...lines];
        nextLines[hooksIdx] = replacement;
        return nextLines
            .filter((line, idx) => idx === hooksIdx || !/^\s*codex_hooks\s*=/.test(line))
            .join('\n');
    }
    return lines
        .flatMap((line, idx) => {
        if (idx === codexHooksIdx)
            return [replacement];
        if (/^\s*codex_hooks\s*=/.test(line))
            return [];
        return [line];
    })
        .join('\n');
}
function migrateDeprecatedCodexHooksFeatureFlagInConfig(configPath) {
    if (!existsSync(configPath))
        return;
    const existing = readFileSync(configPath, 'utf8');
    const next = migrateDeprecatedCodexHooksFeatureFlag(existing);
    if (next === existing)
        return;
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, 'utf8');
}
function readPersistedOmxSetupScope(repoRoot) {
    const scopePath = join(repoRoot, '.omx', 'setup-scope.json');
    if (!existsSync(scopePath))
        return undefined;
    const parsed = JSON.parse(readFileSync(scopePath, 'utf8'));
    if (parsed.scope === 'project' || parsed.scope === 'project-local')
        return 'project';
    if (parsed.scope === 'user')
        return 'user';
    return undefined;
}
function removeTrackedProjectScopedOmxFiles(repoRoot, spawn) {
    const listed = spawn('git', ['ls-files', '-z', '--', '.codex', '.omx'], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: PROBE_TIMEOUT_MS,
    });
    if (listed.error) {
        throw new Error(`could not list tracked OMX project files: ${listed.error.message}`);
    }
    if (listed.status !== 0) {
        throw new Error(`could not list tracked OMX project files: git exited ${listed.status ?? -1}`);
    }
    const files = decodeSpawnStdout(listed.stdout).split('\0').filter(isProjectScopedOmxPath);
    for (const file of files) {
        rmSync(resolveSafeRepoPath(repoRoot, file), { force: true });
        pruneEmptyProjectScopedDirs(repoRoot, file);
    }
    return files;
}
function decodeSpawnStdout(stdout) {
    if (typeof stdout === 'string')
        return stdout;
    if (Buffer.isBuffer(stdout))
        return stdout.toString('utf8');
    return '';
}
function isProjectScopedOmxPath(path) {
    return (path === '.codex' || path.startsWith('.codex/') || path === '.omx' || path.startsWith('.omx/'));
}
function resolveSafeRepoPath(repoRoot, relativePath) {
    const root = resolve(repoRoot);
    const absolute = resolve(root, relativePath);
    if (absolute === root || !absolute.startsWith(`${root}${sep}`)) {
        throw new Error(`refusing to remove path outside repo: ${relativePath}`);
    }
    return absolute;
}
function pruneEmptyProjectScopedDirs(repoRoot, relativeFile) {
    let dir = dirname(relativeFile);
    while (isProjectScopedOmxPath(dir)) {
        try {
            rmdirSync(resolveSafeRepoPath(repoRoot, dir));
        }
        catch {
            return;
        }
        if (dir === '.codex' || dir === '.omx')
            return;
        dir = dirname(dir);
    }
}
/**
 * Refresh `vp`, ensure `omx` is on PATH, then run
 * `omx setup --yes --scope user` in the consumer repo.
 * Idempotent: safe to run on every `wp setup`.
 */
export function ensureOmx(input) {
    if (input.options.dryRun)
        return { kind: 'omx-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    const vpCommand = input.resolveVpCommand !== undefined ? input.resolveVpCommand() : resolveGlobalCapableVpCommand();
    const configPath = input.configPath ?? defaultCodexConfigPath();
    const scope = input.scope ?? 'user';
    const previousScope = readPersistedOmxSetupScope(input.repoRoot);
    // Pre-repair: remove legacy duplicate hook trust blocks before omx setup runs.
    if (existsSync(configPath)) {
        const existing = readFileSync(configPath, 'utf8');
        const repaired = deduplicateCodexHookTrustState(existing);
        if (repaired !== existing) {
            mkdirSync(dirname(configPath), { recursive: true });
            writeFileSync(configPath, repaired, 'utf8');
        }
    }
    let installed = false;
    if (!shouldSkipManagedToolRefresh() && vpCommand !== null) {
        const command = appendGlobalCapableVpArgs(vpCommand, ['update']);
        spawn(command[0], command.slice(1), { stdio: 'inherit' });
    }
    let probe = spawn('omx', ['--version'], { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        if (vpCommand === null)
            return { kind: 'omx-not-found', hint: NOT_FOUND_HINT };
        const command = appendGlobalCapableVpArgs(vpCommand, ['install', '-g', 'oh-my-codex']);
        const install = spawn(command[0], command.slice(1), { stdio: 'inherit' });
        if (install.status !== 0) {
            return { kind: 'omx-not-found', hint: NOT_FOUND_HINT };
        }
        installed = true;
        probe = spawn('omx', ['--version'], { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            return { kind: 'omx-not-found', hint: NOT_FOUND_HINT };
        }
    }
    else if (!shouldSkipManagedToolRefresh() && vpCommand !== null) {
        const command = appendGlobalCapableVpArgs(vpCommand, ['update', '-g', 'oh-my-codex']);
        spawn(command[0], command.slice(1), { stdio: 'inherit' });
    }
    const result = spawn('omx', ['setup', '--yes', '--scope', scope], {
        cwd: input.repoRoot,
        stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (result.status !== 0) {
        return { kind: 'omx-spawn-failed', exitCode: result.status ?? -1 };
    }
    migrateDeprecatedCodexHooksFeatureFlagInConfig(configPath);
    const nodeBinary = resolveBinaryOnPath('node');
    if (nodeBinary !== null) {
        repairInstalledOmxPluginHooks(dirname(configPath), nodeBinary);
    }
    const globalHooksResult = normalizeGlobalCodexHooksFile(defaultCodexHooksPathFromConfig(configPath), { nodeBinary, omxScriptPath: resolveInstalledOmxHookScriptPath() }, input.options);
    const removedProjectFiles = scope === 'user' && previousScope === 'project'
        ? removeTrackedProjectScopedOmxFiles(input.repoRoot, spawn)
        : [];
    return {
        kind: 'omx-ok',
        installed,
        removedProjectFiles,
        codexGlobalHooks: {
            repaired: globalHooksResult.action === 'overwritten' || globalHooksResult.action === 'created',
            targetPath: globalHooksResult.targetPath,
        },
    };
}
//# sourceMappingURL=index.js.map