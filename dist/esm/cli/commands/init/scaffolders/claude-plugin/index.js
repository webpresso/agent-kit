import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isPackageLifecycleEnvironment } from '#cli/auto-update/skip.js';
import { commandExists as defaultCommandExists } from '#runtime/command-exists.js';
export const CLAUDE_PLUGIN_ID = 'agent-kit@webpresso';
function defaultRunCommand(command, args) {
    const result = spawnSync(command, [...args], {
        stdio: 'inherit',
        env: process.env,
    });
    if (result.error)
        throw result.error;
    return result.status ?? 1;
}
export function ensureClaudeCodeUserPlugin(input) {
    const packageRoot = input.packageRoot;
    const pluginManifestPath = join(packageRoot, '.claude-plugin', 'plugin.json');
    if (!existsSync(pluginManifestPath)) {
        return { kind: 'claude-plugin-unavailable', packageRoot };
    }
    if (input.options.dryRun) {
        return { kind: 'claude-plugin-skipped-dry-run', packageRoot };
    }
    const env = input.env ?? process.env;
    if (isPackageLifecycleEnvironment(env)) {
        return { kind: 'claude-plugin-skipped-package-lifecycle', packageRoot };
    }
    if (env.WP_SKIP_CLAUDE_PLUGIN === '1') {
        return { kind: 'claude-plugin-skipped-opt-out', packageRoot };
    }
    const commandExists = input.commandExists ?? defaultCommandExists;
    if (!commandExists('claude')) {
        return { kind: 'claude-plugin-skipped-no-cli', packageRoot };
    }
    const runCommand = input.runCommand ?? defaultRunCommand;
    const steps = [
        {
            step: 'marketplace-add',
            args: ['plugin', 'marketplace', 'add', '--scope', 'user', packageRoot],
        },
        {
            step: 'plugin-install',
            args: ['plugin', 'install', '--scope', 'user', CLAUDE_PLUGIN_ID],
        },
        {
            step: 'plugin-update',
            args: ['plugin', 'update', '--scope', 'user', CLAUDE_PLUGIN_ID],
        },
    ];
    for (const { step, args } of steps) {
        const exitCode = runCommand('claude', args);
        if (exitCode !== 0) {
            return {
                kind: 'claude-plugin-failed',
                packageRoot,
                pluginId: CLAUDE_PLUGIN_ID,
                step,
                exitCode,
            };
        }
    }
    return {
        kind: 'claude-plugin-installed',
        packageRoot,
        pluginId: CLAUDE_PLUGIN_ID,
    };
}
//# sourceMappingURL=index.js.map