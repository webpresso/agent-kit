import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { patchJsonFile } from '#cli/commands/init/merge';
import { agentKitMcpLaunchCommand, findWebpressoMcpEntry, } from '#cli/commands/init/scaffolders/codex-mcp/index';
import { makeNoopSpinnerFactory } from '#cli/commands/init/scaffolders/spinner';
import { checkVersionPin } from '#cli/commands/init/scaffolders/version-pin';
const CODEX_CONTEXT_MODE_FEATURES = {
    plugin_hooks: 'true',
    hooks: 'true',
};
function defaultCodexConfigPath() {
    const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex');
    return join(codexHome, 'config.toml');
}
function defaultOpenCodeConfigPath(repoRoot) {
    return join(repoRoot, 'opencode.json');
}
export function upsertCodexContextModeFeatures(raw) {
    const trimmed = raw.trimEnd();
    const lines = trimmed.length > 0 ? trimmed.split(/\r?\n/) : [];
    const hasContent = raw.trim().length > 0;
    const start = lines.findIndex((line) => line.trim() === '[features]');
    if (start === -1) {
        const prefix = hasContent ? `${raw.trimEnd()}\n\n` : '';
        return `${prefix}[features]\n${Object.entries(CODEX_CONTEXT_MODE_FEATURES)
            .map(([key, value]) => `${key} = ${value}`)
            .join('\n')}\n`;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
        if (lines[i].trim().startsWith('[')) {
            end = i;
            break;
        }
    }
    const seen = new Set();
    const body = lines.slice(start + 1, end).map((line) => {
        const match = line.match(/^(\s*)(hooks|plugin_hooks)\s*=/);
        if (!match)
            return line;
        const key = match[2];
        seen.add(key);
        return `${match[1]}${key} = ${CODEX_CONTEXT_MODE_FEATURES[key]}`;
    });
    const trailingBlankLines = [];
    while (body.length > 0 && body[body.length - 1]?.trim() === '') {
        trailingBlankLines.unshift(body.pop());
    }
    for (const [key, value] of Object.entries(CODEX_CONTEXT_MODE_FEATURES)) {
        if (!seen.has(key))
            body.push(`${key} = ${value}`);
    }
    body.push(...trailingBlankLines);
    return [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join('\n') + '\n';
}
export function patchOpenCodeContextModeConfig(existing, agentKitCommand = ['vp', 'exec', 'wp', 'mcp']) {
    const currentMcp = existing.mcp && typeof existing.mcp === 'object' && !Array.isArray(existing.mcp)
        ? { ...existing.mcp }
        : {};
    currentMcp['context-mode'] = {
        type: 'local',
        command: ['context-mode'],
    };
    currentMcp['webpresso'] = {
        type: 'local',
        command: agentKitCommand,
    };
    const currentPlugins = Array.isArray(existing.plugin)
        ? existing.plugin.filter((value) => typeof value === 'string')
        : [];
    const plugins = currentPlugins.includes('context-mode')
        ? currentPlugins
        : [...currentPlugins, 'context-mode'];
    return {
        ...existing,
        $schema: 'https://opencode.ai/config.json',
        mcp: currentMcp,
        plugin: plugins,
    };
}
function resolveOpenCodeWebpressoCommand(repoRoot, globalInstall = false) {
    const repoLocalRoot = join(repoRoot, 'node_modules', '@webpresso', 'webpresso');
    const entryPath = findWebpressoMcpEntry({ candidates: [repoLocalRoot] }) ?? findWebpressoMcpEntry();
    if (!entryPath)
        return globalInstall ? ['wp', 'mcp'] : ['vp', 'exec', 'wp', 'mcp'];
    const launch = agentKitMcpLaunchCommand(entryPath);
    return [launch.command, ...launch.args];
}
function ensureCodexContextModeFeatures(configPath, options) {
    if (options.dryRun)
        return { targetPath: configPath, action: 'skipped-dry' };
    const existed = existsSync(configPath);
    const existing = existed ? readFileSync(configPath, 'utf8') : '';
    const next = upsertCodexContextModeFeatures(existing);
    if (next === existing)
        return { targetPath: configPath, action: 'identical' };
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, 'utf8');
    return { targetPath: configPath, action: existed ? 'overwritten' : 'created' };
}
const CONTEXT_MODE_NOT_FOUND_HINT = 'context-mode is not on PATH after `vp install -g context-mode`. Install it manually and re-run.';
function ensureContextModeBinary(spawn, spinner) {
    let installed = false;
    spinner.start();
    let probe = spawn('context-mode', ['--help'], { stdio: 'ignore' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        const install = spawn('vp', ['install', '-g', 'context-mode'], { stdio: 'inherit' });
        if (install.status !== 0) {
            spinner.fail('context-mode install failed');
            throw new Error(CONTEXT_MODE_NOT_FOUND_HINT);
        }
        installed = true;
        probe = spawn('context-mode', ['--help'], { stdio: 'ignore' });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            spinner.fail('context-mode not found after install');
            throw new Error(CONTEXT_MODE_NOT_FOUND_HINT);
        }
    }
    else {
        spawn('vp', ['update', '-g', 'context-mode'], { stdio: 'inherit' });
    }
    // Detect installed version for pin check
    const versionProbe = spawn('context-mode', ['--version'], { encoding: 'utf8' });
    const version = String(versionProbe.stdout ?? '').trim();
    spinner.succeed('context-mode ready');
    return { installed, version };
}
export function ensureContextMode(input) {
    const spawn = input.spawn ?? spawnSync;
    const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())('context-mode');
    const { installed, version } = ensureContextModeBinary(spawn, spinner);
    const pinCheck = checkVersionPin('context_mode', version, input.pinFilePath ?? join(input.repoRoot, 'compatible-versions.json'));
    if (!pinCheck.ok) {
        if (input.strict) {
            throw new Error(pinCheck.warning);
        }
        console.warn(pinCheck.warning);
    }
    const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath();
    const opencodeConfigPath = input.opencodeConfigPath ?? defaultOpenCodeConfigPath(input.repoRoot);
    return {
        codexFeatures: ensureCodexContextModeFeatures(codexConfigPath, input.options),
        opencodeConfig: patchJsonFile(opencodeConfigPath, (existing) => patchOpenCodeContextModeConfig(existing, resolveOpenCodeWebpressoCommand(input.repoRoot, input.globalInstall)), input.options),
        installed,
    };
}
//# sourceMappingURL=index.js.map