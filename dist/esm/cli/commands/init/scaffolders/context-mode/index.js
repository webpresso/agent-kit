import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { patchJsonFile } from '#cli/commands/init/merge';
import { hoistTopLevelEvents } from '#cli/commands/init/scaffolders/agent-hooks/index';
const CONTEXT_MODE_MCP_SERVER_NAME = 'context-mode';
const CONTEXT_MODE_MCP_HEADER = `[mcp_servers.${CONTEXT_MODE_MCP_SERVER_NAME}]`;
const CONTEXT_MODE_MCP_BLOCK = `${CONTEXT_MODE_MCP_HEADER}
command = "context-mode"
`;
const CONTEXT_MODE_CODEX_PRETOOL_MATCHER = 'local_shell|shell|shell_command|exec_command|container.exec|Bash|Shell|grep_files|mcp__plugin_context-mode_context-mode__ctx_execute|mcp__plugin_context-mode_context-mode__ctx_execute_file|mcp__plugin_context-mode_context-mode__ctx_batch_execute';
function defaultCodexConfigPath() {
    const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex');
    return join(codexHome, 'config.toml');
}
function defaultCodexHooksPath() {
    const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex');
    return join(codexHome, 'hooks.json');
}
function defaultOpenCodeConfigPath(repoRoot) {
    return join(repoRoot, 'opencode.json');
}
function ensureGroup(groups, group) {
    const command = group.hooks[0]?.command;
    if (!command)
        return groups;
    const exists = groups.some((candidate) => candidate.matcher === group.matcher &&
        candidate.hooks.some((hook) => hook.command === command));
    return exists ? groups : [...groups, group];
}
export function upsertContextModeMcpServer(raw) {
    const lines = raw.trimEnd().split(/\r?\n/);
    const hasContent = raw.trim().length > 0;
    const start = lines.findIndex((line) => line.trim() === CONTEXT_MODE_MCP_HEADER);
    if (start === -1) {
        const prefix = hasContent ? `${raw.trimEnd()}\n\n` : '';
        return `${prefix}${CONTEXT_MODE_MCP_BLOCK}`;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
        if (lines[i].trim().startsWith('[')) {
            end = i;
            break;
        }
    }
    return ([
        ...lines.slice(0, start),
        ...CONTEXT_MODE_MCP_BLOCK.trimEnd().split('\n'),
        ...lines.slice(end),
    ].join('\n') + '\n');
}
export function patchCodexContextModeHooks(existing) {
    const migrated = hoistTopLevelEvents(existing);
    const hooks = { ...(migrated.hooks ?? {}) };
    hooks.PreToolUse = ensureGroup(hooks.PreToolUse ?? [], {
        matcher: CONTEXT_MODE_CODEX_PRETOOL_MATCHER,
        hooks: [{ type: 'command', command: 'context-mode hook codex pretooluse' }],
    });
    hooks.PostToolUse = ensureGroup(hooks.PostToolUse ?? [], {
        hooks: [{ type: 'command', command: 'context-mode hook codex posttooluse' }],
    });
    hooks.SessionStart = ensureGroup(hooks.SessionStart ?? [], {
        hooks: [{ type: 'command', command: 'context-mode hook codex sessionstart' }],
    });
    hooks.UserPromptSubmit = ensureGroup(hooks.UserPromptSubmit ?? [], {
        hooks: [{ type: 'command', command: 'context-mode hook codex userpromptsubmit' }],
    });
    hooks.Stop = ensureGroup(hooks.Stop ?? [], {
        hooks: [{ type: 'command', command: 'context-mode hook codex stop' }],
    });
    return {
        ...migrated,
        hooks,
    };
}
export function patchOpenCodeContextModeConfig(existing) {
    const currentMcp = existing.mcp && typeof existing.mcp === 'object' && !Array.isArray(existing.mcp)
        ? { ...existing.mcp }
        : {};
    currentMcp['context-mode'] = {
        type: 'local',
        command: ['context-mode'],
    };
    currentMcp['agent-kit'] = {
        type: 'local',
        command: ['pnpm', 'exec', 'ak', 'mcp'],
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
function ensureCodexContextModeMcp(configPath, options) {
    if (options.dryRun)
        return { targetPath: configPath, action: 'skipped-dry' };
    const existed = existsSync(configPath);
    const existing = existed ? readFileSync(configPath, 'utf8') : '';
    const next = upsertContextModeMcpServer(existing);
    if (next === existing)
        return { targetPath: configPath, action: 'identical' };
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, 'utf8');
    return { targetPath: configPath, action: existed ? 'overwritten' : 'created' };
}
const CONTEXT_MODE_NOT_FOUND_HINT = 'context-mode is not on PATH after `npm install -g context-mode`. Install it manually and re-run.';
function ensureContextModeBinary(spawn) {
    let installed = false;
    let probe = spawn('context-mode', ['--help'], { stdio: 'ignore' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        const install = spawn('npm', ['install', '-g', 'context-mode'], { stdio: 'inherit' });
        if (install.status !== 0) {
            throw new Error(CONTEXT_MODE_NOT_FOUND_HINT);
        }
        installed = true;
        probe = spawn('context-mode', ['--help'], { stdio: 'ignore' });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            throw new Error(CONTEXT_MODE_NOT_FOUND_HINT);
        }
    }
    return installed;
}
export function ensureContextMode(input) {
    const spawn = input.spawn ?? spawnSync;
    const installed = ensureContextModeBinary(spawn);
    const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath();
    const codexHooksPath = input.codexHooksPath ?? defaultCodexHooksPath();
    const opencodeConfigPath = input.opencodeConfigPath ?? defaultOpenCodeConfigPath(input.repoRoot);
    return {
        codexMcp: ensureCodexContextModeMcp(codexConfigPath, input.options),
        codexHooks: patchJsonFile(codexHooksPath, patchCodexContextModeHooks, input.options),
        opencodeConfig: patchJsonFile(opencodeConfigPath, patchOpenCodeContextModeConfig, input.options),
        installed,
    };
}
//# sourceMappingURL=index.js.map