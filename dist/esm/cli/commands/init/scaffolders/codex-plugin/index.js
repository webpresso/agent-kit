import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isPackageLifecycleEnvironment } from '#cli/auto-update/skip.js';
import { commandExists as defaultCommandExists } from '#runtime/command-exists.js';
/**
 * Codex consumes agent-kit skills through its native plugin system (verified
 * against codex-cli 0.139.0). Unlike Claude, Codex does **not** expose a plugin
 * whose marketplace `source` is the marketplace root itself — the plugin must
 * live in a subdirectory of the marketplace root, referenced by an object
 * `source` (`{ source: "local", path: "./plugins/<name>" }`) in a Codex-native
 * `.agents/plugins/marketplace.json`. The legacy `.claude-plugin/marketplace.json`
 * (string `source: "./"`) is silently ignored by Codex's plugin discovery.
 *
 * So we build a tiny staging marketplace whose `plugins/agent-kit` entry is a
 * symlink to the installed agent-kit package root (which ships `.codex-plugin/
 * plugin.json` + `skills/`), then:
 *   `codex plugin marketplace add <staging>` && `codex plugin add agent-kit@webpresso`
 * Codex copies the plugin into its own cache at install time, so the staging
 * dir only needs to exist at setup time; we keep it at a stable cache path so
 * re-runs are idempotent.
 */
export const CODEX_MARKETPLACE_NAME = 'webpresso';
export const CODEX_PLUGIN_ID = `agent-kit@${CODEX_MARKETPLACE_NAME}`;
const CODEX_PLUGIN_ADD_TIMEOUT_MS = 8_000;
function defaultRunCommand(command, args, options = {}) {
    const result = spawnSync(command, [...args], {
        stdio: 'pipe',
        encoding: 'utf8',
        env: process.env,
        timeout: options.timeoutMs,
    });
    if (result.error) {
        if ('code' in result.error && result.error.code === 'ETIMEDOUT') {
            return { exitCode: 124, timedOut: true };
        }
        throw result.error;
    }
    return { exitCode: result.status ?? 1 };
}
function defaultStagingRoot() {
    return join(homedir(), '.webpresso', 'cache', 'agent-kit', 'codex-marketplace');
}
/**
 * Build (or refresh) the staging marketplace: a `plugins/agent-kit` symlink to
 * the real package plus a Codex-native `.agents/plugins/marketplace.json`.
 */
export function buildCodexStagingMarketplace(stagingRoot, packageRoot) {
    const pluginsDir = join(stagingRoot, 'plugins');
    const marketplaceDir = join(stagingRoot, '.agents', 'plugins');
    mkdirSync(pluginsDir, { recursive: true });
    mkdirSync(marketplaceDir, { recursive: true });
    const link = join(pluginsDir, 'agent-kit');
    rmSync(link, { force: true });
    symlinkSync(packageRoot, link, 'dir');
    const marketplace = {
        name: CODEX_MARKETPLACE_NAME,
        interface: { displayName: 'Webpresso' },
        plugins: [
            {
                name: 'agent-kit',
                source: { source: 'local', path: './plugins/agent-kit' },
                policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
                description: 'Webpresso agent-kit: blueprints, skills, lore commit protocol, tech-debt lifecycle',
                category: 'Productivity',
            },
        ],
    };
    writeFileSync(join(marketplaceDir, 'marketplace.json'), JSON.stringify(marketplace, null, 2) + '\n');
}
export function ensureCodexUserPlugin(input) {
    const packageRoot = input.packageRoot;
    const pluginManifestPath = join(packageRoot, '.codex-plugin', 'plugin.json');
    if (!existsSync(pluginManifestPath)) {
        return { kind: 'codex-plugin-unavailable', packageRoot };
    }
    if (input.options.dryRun) {
        return { kind: 'codex-plugin-skipped-dry-run', packageRoot };
    }
    const env = input.env ?? process.env;
    if (isPackageLifecycleEnvironment(env)) {
        return { kind: 'codex-plugin-skipped-package-lifecycle', packageRoot };
    }
    if (env.WP_SKIP_CODEX_PLUGIN === '1') {
        return { kind: 'codex-plugin-skipped-opt-out', packageRoot };
    }
    const commandExists = input.commandExists ?? defaultCommandExists;
    if (!commandExists('codex')) {
        return { kind: 'codex-plugin-skipped-no-cli', packageRoot };
    }
    const stagingRoot = input.stagingRoot ?? defaultStagingRoot();
    buildCodexStagingMarketplace(stagingRoot, packageRoot);
    const runCommand = input.runCommand ?? defaultRunCommand;
    // Best-effort: drop any stale `webpresso` marketplace (e.g. an earlier
    // registration that pointed at the package root) so the staging dir is used.
    runCommand('codex', ['plugin', 'marketplace', 'remove', CODEX_MARKETPLACE_NAME, '--json']);
    const steps = [
        {
            step: 'marketplace-add',
            args: ['plugin', 'marketplace', 'add', stagingRoot, '--json'],
        },
    ];
    for (const { step, args } of steps) {
        const { exitCode } = runCommand('codex', args);
        if (exitCode !== 0) {
            return {
                kind: 'codex-plugin-failed',
                packageRoot,
                pluginId: CODEX_PLUGIN_ID,
                stagingRoot,
                step,
                exitCode,
            };
        }
    }
    const pluginAdd = runCommand('codex', ['plugin', 'add', 'agent-kit', '--marketplace', CODEX_MARKETPLACE_NAME, '--json'], { timeoutMs: CODEX_PLUGIN_ADD_TIMEOUT_MS });
    if (pluginAdd.timedOut) {
        return {
            kind: 'codex-plugin-timed-out',
            packageRoot,
            pluginId: CODEX_PLUGIN_ID,
            stagingRoot,
            step: 'plugin-add',
            timeoutMs: CODEX_PLUGIN_ADD_TIMEOUT_MS,
        };
    }
    if (pluginAdd.exitCode !== 0) {
        return {
            kind: 'codex-plugin-failed',
            packageRoot,
            pluginId: CODEX_PLUGIN_ID,
            stagingRoot,
            step: 'plugin-add',
            exitCode: pluginAdd.exitCode,
        };
    }
    return {
        kind: 'codex-plugin-installed',
        packageRoot,
        pluginId: CODEX_PLUGIN_ID,
        stagingRoot,
    };
}
//# sourceMappingURL=index.js.map