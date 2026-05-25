/**
 * `wp hooks doctor` — post-install plugin health verification.
 *
 * Verifies the webpresso plugin installation is healthy:
 * - all hook bins exist
 * - bins are executable (skip on win32)
 * - bins respond to empty stdin with exit 0 + JSON
 * - plugin.json exists and references only paths that exist
 * - MCP server starts and responds to tools/list (soft-fail)
 * - installed host CLIs (Codex/OpenCode/Claude) can see the expected surfaces
 */
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMcpReady } from './shared/mcp-sentinel.js';
const RTK_REQUESTED_MARKER = join('.agent', '.rtk-requested');
const RTK_INSTALL_HINT = 'rtk requested via --with rtk but not on PATH; brew install rtk';
const HOST_SMOKE_ENV = 'WP_RUN_HOST_SMOKE';
/** Hook bin definitions */
const HOOK_BINS = [
    { name: 'pretool-guard', binName: 'wp-pretool-guard', checkStdin: true },
    { name: 'post-tool (lint-after-edit)', binName: 'wp-post-tool', checkStdin: false },
    { name: 'stop (qa-changed-files)', binName: 'wp-stop-qa', checkStdin: false },
    { name: 'guard-switch', binName: 'wp-guard-switch', checkStdin: true },
    { name: 'sessionstart', binName: 'wp-sessionstart-routing', checkStdin: true },
    { name: 'test-quality-check', binName: 'wp-test-quality-check', checkStdin: false },
];
function resolvePackageRoot() {
    let dir = dirname(fileURLToPath(import.meta.url));
    while (dir !== dirname(dir)) {
        if (tryAccess(join(dir, 'package.json')))
            return dir;
        dir = dirname(dir);
    }
    return null;
}
function resolveHookBin(binName) {
    try {
        const root = resolvePackageRoot();
        if (!root)
            return null;
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
        const binScript = pkg.bin?.[binName];
        if (!binScript)
            return null;
        return resolve(root, binScript);
    }
    catch {
        return null;
    }
}
function resolveAkCliPath() {
    const root = resolvePackageRoot();
    if (!root)
        return null;
    const builtCli = join(root, 'dist', 'esm', 'cli', 'cli.js');
    if (tryAccess(builtCli))
        return builtCli;
    const sourceCli = join(root, 'src', 'cli', 'cli.ts');
    if (tryAccess(sourceCli))
        return sourceCli;
    return null;
}
function resolveMcpProbeCommand() {
    const root = resolvePackageRoot();
    if (root) {
        const builtCli = join(root, 'dist', 'esm', 'mcp', 'cli.js');
        if (tryAccess(builtCli))
            return { command: 'node', args: [builtCli] };
    }
    const akCli = resolveAkCliPath();
    if (!akCli)
        return null;
    return akCli.endsWith('.ts')
        ? { command: 'bun', args: [akCli, 'mcp'] }
        : { command: 'node', args: [akCli, 'mcp'] };
}
function resolvePluginRoot() {
    const root = resolvePackageRoot();
    return root && tryAccess(join(root, '.claude-plugin', 'plugin.json')) ? root : null;
}
function isExecutable(file) {
    try {
        const stat = statSync(file);
        return (stat.mode & 0o111) !== 0;
    }
    catch {
        return false;
    }
}
function tryAccess(file) {
    try {
        accessSync(file, constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
function wasRtkRequested(cwd = process.cwd()) {
    return tryAccess(join(cwd, RTK_REQUESTED_MARKER));
}
function shouldRunHostChecks(mode) {
    if (mode === 'skip')
        return false;
    if (mode === 'required')
        return true;
    return process.env[HOST_SMOKE_ENV] === '1';
}
function shouldRequireHost(mode) {
    return mode === 'required';
}
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw `\u001B\[[0-9;]*m`, 'g');
function stripAnsi(text) {
    return text.replace(ANSI_ESCAPE_PATTERN, '');
}
function resolveRequestedHosts(mode, hostNames) {
    const defaults = ['codex', 'opencode', 'claude'];
    return mode === 'skip' ? [] : hostNames && hostNames.length > 0 ? hostNames : defaults;
}
function checkRtkOnPath(cwd) {
    if (!wasRtkRequested(cwd))
        return Promise.resolve(null);
    return new Promise((resolve) => {
        const child = spawn('rtk', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', () => {
            resolve({ name: 'rtk on PATH', ok: false, detail: RTK_INSTALL_HINT });
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ name: 'rtk on PATH', ok: true, detail: stdout.trim() || 'rtk present' });
                return;
            }
            const suffix = stderr.trim().length > 0 ? ` (${stderr.trim()})` : '';
            resolve({ name: 'rtk on PATH', ok: false, detail: `${RTK_INSTALL_HINT}${suffix}` });
        });
    });
}
async function probeHookBin(file, checkStdin) {
    if (!tryAccess(file)) {
        return { ok: false, detail: 'file not found' };
    }
    if (platform() !== 'win32' && !isExecutable(file)) {
        return { ok: false, detail: 'not executable' };
    }
    if (!checkStdin) {
        return probeExitZero(file);
    }
    return probeJsonStdin(file);
}
function probeExitZero(file) {
    return new Promise((resolve) => {
        const child = spawn(file, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        child.stdin.end();
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', (err) => {
            resolve({ ok: false, detail: String(err.message) });
        });
        child.on('close', (code) => {
            resolve(code === 0
                ? { ok: true }
                : { ok: false, detail: `exit ${code}${stderr ? `: ${stderr.trim()}` : ''}` });
        });
    });
}
function probeJsonStdin(file) {
    return new Promise((resolve) => {
        const child = spawn(file, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const settle = (result) => {
            if (settled)
                return;
            settled = true;
            resolve(result);
        };
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.stdin.on?.('error', (err) => {
            settle({ ok: false, detail: `stdin write failed: ${err.message}` });
        });
        child.stdin.write('{}\n', () => {
            child.stdin.end();
        });
        child.on('error', (err) => {
            settle({ ok: false, detail: String(err.message) });
        });
        child.on('close', (code) => {
            if (code !== 0) {
                settle({ ok: false, detail: `exit ${code}${stderr ? `: ${stderr.trim()}` : ''}` });
                return;
            }
            try {
                JSON.parse(stdout.trim());
                settle({ ok: true });
            }
            catch {
                settle({ ok: false, detail: `invalid JSON on stdout: ${stdout.trim().slice(0, 80)}` });
            }
        });
    });
}
function checkPluginJson() {
    const root = resolvePluginRoot();
    if (!root) {
        return { ok: false, detail: 'plugin root not found (wp not in PATH)' };
    }
    const pluginJsonPath = join(root, '.claude-plugin', 'plugin.json');
    if (!tryAccess(pluginJsonPath)) {
        return { ok: false, detail: 'plugin.json not found' };
    }
    try {
        const content = readFileSync(pluginJsonPath, 'utf-8');
        const manifest = JSON.parse(content);
        if (!manifest.version) {
            return { ok: false, detail: 'plugin.json missing version' };
        }
        const referencedPaths = new Set();
        const collectFromCommand = (command) => {
            if (typeof command !== 'string')
                return;
            for (const token of command.split(/\s+/)) {
                if (!token.includes('${CLAUDE_PLUGIN_ROOT}/'))
                    continue;
                const relative = token.replace('${CLAUDE_PLUGIN_ROOT}/', '').replace(/^["']|["']$/g, '');
                referencedPaths.add(relative);
            }
        };
        for (const eventHooks of Object.values(manifest.hooks ?? {})) {
            if (!Array.isArray(eventHooks))
                continue;
            for (const group of eventHooks) {
                if (!Array.isArray(group?.hooks))
                    continue;
                for (const hook of group.hooks) {
                    collectFromCommand(hook?.command);
                }
            }
        }
        for (const server of Object.values(manifest.mcpServers ?? {})) {
            if (Array.isArray(server.args)) {
                for (const arg of server.args)
                    collectFromCommand(arg);
            }
        }
        for (const relative of referencedPaths) {
            const resolved = resolve(root, relative);
            if (!tryAccess(resolved)) {
                return { ok: false, detail: `path referenced in plugin.json not found: ${relative}` };
            }
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, detail: `failed to read plugin.json: ${String(err)}` };
    }
}
async function checkMcpServer() {
    if (isMcpReady()) {
        return { ok: true, detail: 'MCP server already running (sentinel found)', skipped: true };
    }
    const timeoutMs = Number(process.env.WP_DOCTOR_MCP_TIMEOUT_MS ?? 5000);
    const probeCommand = resolveMcpProbeCommand();
    if (!probeCommand) {
        return { ok: false, detail: 'MCP server (wp) not found in .bin' };
    }
    return new Promise((resolve) => {
        const child = spawn(probeCommand.command, probeCommand.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, WP_DOCTOR_MCP_TIMEOUT_MS: String(timeoutMs) },
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            child.kill();
            resolve(result);
        };
        const timer = setTimeout(() => {
            finish({ ok: false, detail: `MCP server did not respond within ${timeoutMs}ms` });
        }, timeoutMs);
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
            let newlineIndex = stdout.indexOf('\n');
            while (newlineIndex !== -1) {
                const line = stdout.slice(0, newlineIndex).trim();
                stdout = stdout.slice(newlineIndex + 1);
                if (line) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.result && typeof parsed.result === 'object' && 'tools' in parsed.result) {
                            finish({
                                ok: true,
                                detail: `MCP server responded with ${parsed.result.tools.length} tools`,
                            });
                            return;
                        }
                    }
                    catch { }
                }
                newlineIndex = stdout.indexOf('\n');
            }
        });
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
        });
        const initializeRequest = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'webpresso-hooks-doctor', version: '0.0.0' },
            },
        }) + '\n';
        const toolsListRequest = JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
        }) + '\n';
        child.stdin.write(initializeRequest, () => {
            child.stdin.write(toolsListRequest, () => { });
        });
        child.on('error', (err) => {
            finish({ ok: false, detail: String(err.message) });
        });
        child.on('close', (code) => {
            if (settled)
                return;
            if (code !== 0 && code !== null) {
                finish({
                    ok: false,
                    detail: `MCP server exited with code ${code}: ${stderr.trim().slice(0, 100) || '(no stderr)'}`,
                });
                return;
            }
            finish({
                ok: false,
                detail: `MCP server responded but no valid tools/list result: ${stdout.trim().slice(0, 80)}`,
            });
        });
    });
}
function runCommand(command, args, cwd = process.cwd()) {
    return new Promise((resolve) => {
        const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', (err) => {
            resolve({ ok: false, stdout, stderr: err.message, code: null });
        });
        child.on('close', (code) => {
            resolve({ ok: code === 0, stdout, stderr, code });
        });
    });
}
async function checkCodexHost() {
    const available = await runCommand('codex', ['--version']);
    if (!available.ok) {
        return { name: 'Codex host integration', ok: true, detail: 'skipped (codex not on PATH)' };
    }
    const result = await runCommand('codex', ['mcp', 'list']);
    if (!result.ok) {
        return {
            name: 'Codex host integration',
            ok: false,
            detail: result.stderr.trim() || `exit ${result.code}`,
        };
    }
    const hasAgentKit = result.stdout.includes('webpresso');
    const hasContextMode = result.stdout.includes('context-mode');
    return hasAgentKit && hasContextMode
        ? { name: 'Codex host integration', ok: true, detail: 'webpresso + context-mode MCP visible' }
        : {
            name: 'Codex host integration',
            ok: false,
            detail: `missing MCP entries (webpresso=${hasAgentKit}, context-mode=${hasContextMode})`,
        };
}
async function checkOpenCodeHost(cwd = process.cwd()) {
    const available = await runCommand('opencode', ['--version']);
    if (!available.ok) {
        return { name: 'OpenCode host integration', ok: true, detail: 'skipped (opencode not on PATH)' };
    }
    const result = await runCommand('opencode', ['mcp', 'list'], cwd);
    if (!result.ok) {
        return {
            name: 'OpenCode host integration',
            ok: false,
            detail: result.stderr.trim() || `exit ${result.code}`,
        };
    }
    const stdout = stripAnsi(result.stdout);
    const hasAgentKit = stdout.includes('webpresso');
    const hasContextMode = stdout.includes('context-mode');
    const agentKitConnected = /✓\s+webpresso\b/.test(stdout);
    const contextModeConnected = /✓\s+context-mode\b/.test(stdout);
    if (!hasAgentKit || !hasContextMode) {
        return {
            name: 'OpenCode host integration',
            ok: false,
            detail: `missing MCP entries (webpresso=${hasAgentKit}, context-mode=${hasContextMode})`,
        };
    }
    return agentKitConnected && contextModeConnected
        ? {
            name: 'OpenCode host integration',
            ok: true,
            detail: 'webpresso + context-mode MCP connected',
        }
        : {
            name: 'OpenCode host integration',
            ok: false,
            detail: `MCP not connected (webpresso=${agentKitConnected}, context-mode=${contextModeConnected})`,
        };
}
async function checkClaudeHost() {
    const available = await runCommand('claude', ['--version']);
    if (!available.ok) {
        return { name: 'Claude host integration', ok: true, detail: 'skipped (claude not on PATH)' };
    }
    const root = resolvePluginRoot();
    if (!root) {
        return {
            name: 'Claude host integration',
            ok: true,
            detail: 'skipped (plugin root not available in this repo)',
        };
    }
    const result = await runCommand('claude', ['plugin', 'validate', root]);
    return result.ok
        ? { name: 'Claude host integration', ok: true, detail: 'plugin validate passed' }
        : {
            name: 'Claude host integration',
            ok: false,
            detail: result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`,
        };
}
export async function runHooksDoctor(opts = {}) {
    const checks = [];
    const isWin = platform() === 'win32';
    for (const bin of HOOK_BINS) {
        const file = resolveHookBin(bin.binName);
        const exists = file && tryAccess(file);
        if (!exists) {
            checks.push({ name: bin.name, ok: false, detail: `bin '${bin.binName}' not found in .bin` });
            continue;
        }
        if (!isWin && !isExecutable(file)) {
            checks.push({ name: bin.name, ok: false, detail: 'exists but not executable' });
            continue;
        }
        const probe = await probeHookBin(file, bin.checkStdin);
        checks.push({ name: bin.name, ok: probe.ok, detail: probe.detail });
    }
    checks.push({ name: 'plugin.json integrity', ...checkPluginJson() });
    if (opts.skipMcp) {
        checks.push({ name: 'MCP server liveness', ok: true, detail: 'skipped (--skip-mcp)' });
    }
    else {
        const mcpResult = await checkMcpServer();
        checks.push({
            name: 'MCP server liveness',
            ok: true,
            detail: mcpResult.skipped
                ? mcpResult.detail
                : mcpResult.ok
                    ? mcpResult.detail
                    : `WARNING: ${mcpResult.detail}`,
        });
    }
    const rtkCheck = await checkRtkOnPath(opts.cwd);
    if (rtkCheck)
        checks.push(rtkCheck);
    const hostMode = opts.hosts ?? 'auto';
    if (shouldRunHostChecks(hostMode)) {
        for (const host of resolveRequestedHosts(hostMode, opts.hostNames)) {
            if (host === 'codex') {
                checks.push(await checkCodexHost());
            }
            if (host === 'opencode') {
                checks.push(await checkOpenCodeHost());
            }
            if (host === 'claude') {
                checks.push(await checkClaudeHost());
            }
        }
    }
    const requiredHosts = shouldRequireHost(hostMode);
    if (requiredHosts) {
        for (const host of resolveRequestedHosts(hostMode, opts.hostNames)) {
            if (host === 'codex') {
                const available = await runCommand('codex', ['--version']);
                if (!available.ok)
                    checks.push({
                        name: 'Codex host integration',
                        ok: false,
                        detail: 'codex required but not on PATH',
                    });
            }
            if (host === 'opencode') {
                const available = await runCommand('opencode', ['--version']);
                if (!available.ok)
                    checks.push({
                        name: 'OpenCode host integration',
                        ok: false,
                        detail: 'opencode required but not on PATH',
                    });
            }
            if (host === 'claude') {
                const available = await runCommand('claude', ['--version']);
                if (!available.ok)
                    checks.push({
                        name: 'Claude host integration',
                        ok: false,
                        detail: 'claude required but not on PATH',
                    });
            }
        }
    }
    const nonMcpChecks = checks.filter((c) => !c.name.startsWith('MCP '));
    const overallOk = nonMcpChecks.every((c) => c.ok);
    return { ok: overallOk, checks };
}
export async function printHooksDoctor(opts = {}) {
    const result = await runHooksDoctor(opts);
    for (const check of result.checks) {
        const icon = check.ok ? '[x]' : '[ ]';
        const detail = check.detail ? `: ${check.detail}` : '';
        console.error(`${icon} ${check.name}${detail}`);
    }
    return result.ok ? 0 : 1;
}
//# sourceMappingURL=doctor.js.map