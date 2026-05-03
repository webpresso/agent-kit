/**
 * `ak hooks doctor` — post-install plugin health verification.
 *
 * Verifies the agent-kit plugin installation is healthy:
 * - all hook bins exist
 * - bins are executable (skip on win32)
 * - bins respond to empty stdin with exit 0 + JSON
 * - plugin.json exists and references only paths that exist
 * - MCP server starts and responds to tools/list (soft-fail)
 */
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMcpReady } from './shared/mcp-sentinel.js';
/** Hook bin definitions */
const HOOK_BINS = [
    { name: 'pretool-guard', binName: 'ak-pretool-guard', checkStdin: true },
    { name: 'post-tool (lint-after-edit)', binName: 'ak-post-tool', checkStdin: false },
    { name: 'stop (qa-changed-files)', binName: 'ak-stop-qa', checkStdin: false },
    { name: 'guard-switch', binName: 'ak-guard-switch', checkStdin: true },
    { name: 'sessionstart', binName: 'ak-sessionstart-routing', checkStdin: true },
    { name: 'test-quality-check', binName: 'ak-test-quality-check', checkStdin: false },
];
/**
 * Find the package root by walking upward from this module file.
 *
 * This is stable in both source (`src/hooks/doctor.ts`) and built
 * (`dist/esm/hooks/doctor.js`) execution, and does not depend on
 * Node/CommonJS `require.resolve` behavior.
 */
function resolvePackageRoot() {
    let dir = dirname(fileURLToPath(import.meta.url));
    while (dir !== dirname(dir)) {
        if (tryAccess(join(dir, 'package.json')))
            return dir;
        dir = dirname(dir);
    }
    return null;
}
/**
 * Find the real path of a bin by reading package.json relative to the current
 * installed package root. Works in workspace, packed, and global installs.
 */
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
function resolveMcpBin() {
    return resolveHookBin('ak');
}
function resolveMcpProbeCommand() {
    const root = resolvePackageRoot();
    if (root) {
        const builtCli = join(root, 'dist', 'esm', 'mcp', 'cli.js');
        if (tryAccess(builtCli))
            return { command: 'node', args: [builtCli] };
    }
    const akBin = resolveMcpBin();
    if (!akBin)
        return null;
    return { command: process.execPath, args: [akBin, 'mcp'] };
}
function resolvePluginRoot() {
    const akBin = resolveMcpBin();
    if (!akBin)
        return null;
    let dir = dirname(akBin);
    while (dir !== dirname(dir)) {
        if (tryAccess(join(dir, '.claude-plugin', 'plugin.json')))
            return dir;
        dir = dirname(dir);
    }
    return null;
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
/**
 * Run a hook binary with `echo '{}' | node <bin>` and check it exits 0
 * and produces valid JSON on stdout.
 */
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
            resolve(code === 0 ? { ok: true } : { ok: false, detail: `exit ${code}${stderr ? `: ${stderr.trim()}` : ''}` });
        });
    });
}
function probeJsonStdin(file) {
    return new Promise((resolve) => {
        const child = spawn(file, [], { stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.stdin.write('{}\n', () => {
            child.stdin.end();
        });
        child.on('error', (err) => {
            resolve({ ok: false, detail: String(err.message) });
        });
        child.on('close', (code) => {
            if (code !== 0) {
                resolve({ ok: false, detail: `exit ${code}${stderr ? `: ${stderr.trim()}` : ''}` });
                return;
            }
            try {
                JSON.parse(stdout.trim());
                resolve({ ok: true });
            }
            catch {
                resolve({ ok: false, detail: `invalid JSON on stdout: ${stdout.trim().slice(0, 80)}` });
            }
        });
    });
}
function checkPluginJson() {
    const root = resolvePluginRoot();
    if (!root) {
        return { ok: false, detail: 'plugin root not found (ak not in PATH)' };
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
    // Fast path: if sentinel exists and PID is alive, MCP is already running
    if (isMcpReady()) {
        return { ok: true, detail: 'MCP server already running (sentinel found)', skipped: true };
    }
    const timeoutMs = Number(process.env.AK_DOCTOR_MCP_TIMEOUT_MS ?? 5000);
    const probeCommand = resolveMcpProbeCommand();
    if (!probeCommand) {
        return { ok: false, detail: 'MCP server (ak) not found in .bin' };
    }
    return new Promise((resolve) => {
        const child = spawn(probeCommand.command, probeCommand.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, AK_DOCTOR_MCP_TIMEOUT_MS: String(timeoutMs) },
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
                    catch {
                        // ignore non-JSON lines until close/timeout
                    }
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
                clientInfo: { name: 'agent-kit-hooks-doctor', version: '0.0.0' },
            },
        }) + '\n';
        const toolsListRequest = JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
        }) + '\n';
        child.stdin.write(initializeRequest, () => {
            child.stdin.write(toolsListRequest, () => {
                // Keep stdin open until we receive a response or time out. Closing
                // immediately can terminate the stdio server before it flushes the
                // initialize/tools-list responses.
            });
        });
        child.on('error', (err) => {
            finish({ ok: false, detail: String(err.message) });
        });
        child.on('close', (code) => {
            if (settled)
                return;
            if (code !== 0 && code !== null) {
                finish({ ok: false, detail: `MCP server exited with code ${code}: ${stderr.trim().slice(0, 100) || '(no stderr)'}` });
                return;
            }
            finish({ ok: false, detail: `MCP server responded but no valid tools/list result: ${stdout.trim().slice(0, 80)}` });
        });
    });
}
export async function runHooksDoctor(opts = {}) {
    const checks = [];
    const isWin = platform() === 'win32';
    // 1. Bin existence + executable checks
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
        // 2. stdin response check (exit 0 + JSON for interactive bins)
        const probe = await probeHookBin(file, bin.checkStdin);
        checks.push({ name: bin.name, ok: probe.ok, detail: probe.detail });
    }
    // 3. plugin.json integrity
    checks.push({ name: 'plugin.json integrity', ...checkPluginJson() });
    // 4. MCP server liveness (soft-fail)
    if (opts.skipMcp) {
        checks.push({ name: 'MCP server liveness', ok: true, detail: 'skipped (--skip-mcp)' });
    }
    else {
        const mcpResult = await checkMcpServer();
        // Soft-fail: MCP check never sets ok: false in the final result,
        // but we record it so the output can show a warning.
        checks.push({
            name: 'MCP server liveness',
            ok: true, // always pass — MCP failures are soft
            detail: mcpResult.skipped
                ? mcpResult.detail
                : mcpResult.ok
                    ? mcpResult.detail
                    : `WARNING: ${mcpResult.detail}`,
        });
    }
    // Non-MCP checks must all pass
    const nonMcpChecks = checks.filter((c) => !c.name.startsWith('MCP '));
    const overallOk = nonMcpChecks.every((c) => c.ok);
    return { ok: overallOk, checks };
}
export async function printHooksDoctor(opts = {}) {
    const result = await runHooksDoctor(opts);
    for (const check of result.checks) {
        const icon = check.ok ? '[x]' : '[ ]';
        const detail = check.detail ? `: ${check.detail}` : '';
        // Use stderr so skill output doesn't pollute stdout (which is JSON for hooks)
        console.error(`${icon} ${check.name}${detail}`);
    }
    return result.ok ? 0 : 1;
}
//# sourceMappingURL=doctor.js.map