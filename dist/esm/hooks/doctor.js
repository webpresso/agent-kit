/**
 * `wp hooks doctor` — post-install plugin health verification.
 *
 * Verifies the agent-kit plugin installation is healthy:
 * - all hook bins exist
 * - bins are executable (skip on win32)
 * - bins respond to empty stdin with exit 0 + JSON
 * - plugin.json exists and references only paths that exist
 * - MCP server starts and responds to tools/list (soft-fail)
 * - installed host CLIs (Codex/OpenCode/Claude) can see the expected surfaces
 */
import { accessSync, constants, lstatSync, readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { join, resolve } from 'node:path';
import { repairInstalledOmxPluginHooks } from '#cli/commands/init/scaffolders/omx/index.js';
import { diffHooksManifest, readHooksManifest, } from '#cli/commands/init/scaffolders/agent-hooks/manifest.js';
import { setupCommandForRepo } from '#cli/commands/init/detect-consumer.js';
import { findAgentKitPackageRoot, resolveAgentKitPackageRoot, } from '#cli/commands/init/package-root';
import { expectedRootWpBinRelativePath, formatRootLauncherContractFailure, rootContractMode, validateRootLauncherContract, } from '#launcher/root-contract.js';
import { isMcpReady } from './shared/mcp-sentinel.js';
const RTK_REQUESTED_MARKER = join('.agent', '.rtk-requested');
const RTK_INSTALL_HINT = 'rtk requested via --with rtk but not on PATH; brew install rtk';
const HOST_SMOKE_ENV = 'WP_RUN_HOST_SMOKE';
const OPERATOR_PRECEDENCE_DETAIL = 'MCP first (`wp_*` tools), direct `wp` only as fallback, and never `bun run wp` / `pnpm run wp` / `npm run wp` / `yarn wp` / `vp run wp`';
/** Hook bin definitions */
const HOOK_BINS = [
    { name: 'pretool-guard', hookName: 'pretool-guard', checkStdin: true },
    { name: 'post-tool (lint-after-edit)', hookName: 'post-tool', checkStdin: false },
    { name: 'stop (qa-changed-files)', hookName: 'stop-qa', checkStdin: false },
    { name: 'guard-switch', hookName: 'guard-switch', checkStdin: true },
    { name: 'sessionstart', hookName: 'sessionstart-routing', checkStdin: true },
    { name: 'test-quality-check', hookName: 'test-quality-check', checkStdin: false },
];
function resolvePackageRoot() {
    return resolvePackageRootForRuntime();
}
export function resolvePackageRootForRuntime(options = {}) {
    return resolveAgentKitPackageRoot(options);
}
export function findOwningPackageRoot(startDir) {
    return findAgentKitPackageRoot(startDir);
}
function resolveWpCliCommand() {
    const root = resolvePackageRoot();
    if (!root)
        return null;
    const candidate = join(root, 'bin', process.platform === 'win32' ? 'wp.cmd' : 'wp');
    if (tryAccess(candidate))
        return { command: candidate, args: [] };
    const builtCli = join(root, 'dist', 'esm', 'cli', 'cli.js');
    if (tryAccess(builtCli))
        return { command: 'node', args: [builtCli] };
    const sourceCli = join(root, 'src', 'cli', 'cli.ts');
    if (tryAccess(sourceCli))
        return { command: 'bun', args: [sourceCli] };
    return null;
}
function operatorPrecedenceCheck() {
    return {
        name: 'operator flow',
        ok: true,
        advisory: true,
        detail: OPERATOR_PRECEDENCE_DETAIL,
    };
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
const ABS_BIN_PATTERN = /["'](?<path>\/[^"']*node_modules\/\.bin\/wp-[\w-]+)["']/gu;
const REL_BIN_PATTERN = /["'](?<path>\.\/node_modules\/\.bin\/wp-[\w-]+)["']/gu;
function extractOwnedCodexHookBinPaths(command, cwd) {
    const paths = new Set();
    for (const match of command.matchAll(ABS_BIN_PATTERN)) {
        const p = match.groups?.path;
        if (p)
            paths.add(p);
    }
    for (const match of command.matchAll(REL_BIN_PATTERN)) {
        const p = match.groups?.path;
        if (p)
            paths.add(resolve(cwd, p));
    }
    return [...paths];
}
function checkConsumerCodexHookPaths(cwd = process.cwd()) {
    const hooksPath = join(cwd, '.codex', 'hooks.json');
    if (!tryAccess(hooksPath)) {
        return {
            name: 'consumer codex hook command paths',
            ok: true,
            detail: 'skipped (no .codex/hooks.json)',
        };
    }
    try {
        const parsed = JSON.parse(readFileSync(hooksPath, 'utf-8'));
        const commandPaths = new Set();
        for (const groups of Object.values(parsed.hooks ?? {})) {
            for (const group of groups ?? []) {
                for (const hook of group.hooks ?? []) {
                    if (typeof hook.command !== 'string')
                        continue;
                    for (const path of extractOwnedCodexHookBinPaths(hook.command, cwd)) {
                        commandPaths.add(path);
                    }
                }
            }
        }
        if (commandPaths.size === 0) {
            return {
                name: 'consumer codex hook command paths',
                ok: true,
                detail: 'no wp-* node_modules hook paths found in .codex/hooks.json',
            };
        }
        const missing = [];
        for (const binPath of commandPaths) {
            if (!tryAccess(binPath) || (platform() !== 'win32' && !isExecutable(binPath))) {
                missing.push(binPath);
            }
        }
        if (missing.length > 0) {
            const preview = missing.slice(0, 3).join(', ');
            return {
                name: 'consumer codex hook command paths',
                ok: false,
                detail: `missing/non-executable hook bins (${missing.length}): ${preview}`,
            };
        }
        return {
            name: 'consumer codex hook command paths',
            ok: true,
            detail: `${commandPaths.size} hook bin path(s) resolvable`,
        };
    }
    catch (error) {
        return {
            name: 'consumer codex hook command paths',
            ok: false,
            detail: `failed to parse .codex/hooks.json: ${error instanceof Error ? error.message : String(error)}`,
        };
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
export function checkRtkOnPath(cwd) {
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
async function probeHookBin(wpCli, hookName, checkStdin) {
    if ((wpCli.command.includes('/') || wpCli.command.includes('\\')) && !tryAccess(wpCli.command)) {
        return { ok: false, detail: 'file not found' };
    }
    if (platform() !== 'win32' &&
        (wpCli.command.includes('/') || wpCli.command.includes('\\')) &&
        !isExecutable(wpCli.command)) {
        return { ok: false, detail: 'not executable' };
    }
    if (!checkStdin) {
        return probeExitZero(wpCli, hookName);
    }
    return probeJsonStdin(wpCli, hookName);
}
function probeExitZero(wpCli, hookName) {
    return new Promise((resolve) => {
        const child = spawn(wpCli.command, [...wpCli.args, 'hook', hookName], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
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
function probeJsonStdin(wpCli, hookName) {
    return new Promise((resolve) => {
        const child = spawn(wpCli.command, [...wpCli.args, 'hook', hookName], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
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
function formatNativeRuntimeDetail(status) {
    return [
        `launchMode=${status.launchMode}`,
        status.targetId ? `targetId=${status.targetId}` : null,
        status.manifestPath ? `manifest=${status.manifestPath}` : null,
        status.stagedBinPath ? `stagedBin=${status.stagedBinPath}` : null,
        status.runtimeTargetPath ? `targetBin=${status.runtimeTargetPath}` : null,
        status.reason ? `reason=${status.reason}` : null,
    ]
        .filter((value) => value !== null)
        .join(', ');
}
function isSourceCheckoutWithRuntimeTooling(root) {
    return (tryAccess(join(root, 'src', 'cli', 'cli.ts')) &&
        tryAccess(join(root, 'scripts', 'build-runtime-binaries.ts')) &&
        tryAccess(join(root, 'scripts', 'stage-plugin-runtime-artifacts.ts')));
}
export function checkRootLauncherContract() {
    const root = resolvePackageRoot();
    if (!root) {
        return {
            name: 'root launcher contract',
            ok: false,
            detail: `contract=${rootContractMode}, expected=${expectedRootWpBinRelativePath}, reason=package root not found`,
        };
    }
    const launcherPath = join(root, expectedRootWpBinRelativePath);
    const status = validateRootLauncherContract(launcherPath);
    const detail = [
        `contract=${rootContractMode}`,
        `expected=${expectedRootWpBinRelativePath}`,
        status.ok
            ? 'root bin/wp is the JS selector for runtime-required, phase2-runtime, and JS/Bun holdback lanes'
            : `reason=${formatRootLauncherContractFailure(status, expectedRootWpBinRelativePath)}`,
    ].join(', ');
    return { name: 'root launcher contract', ok: status.ok, detail };
}
export function checkOmxPluginCacheStaleSurfaceRepair(options = {}) {
    const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? join(process.env.HOME || '', '.codex');
    if (!codexHome) {
        return {
            name: 'OMX plugin-cache stale-surface repair',
            ok: true,
            detail: 'skipped (CODEX_HOME/HOME unavailable; durable ownership belongs to OMX setup/plugin generation)',
        };
    }
    const nodeBinary = options.nodeBinary ?? process.execPath;
    if (!nodeBinary) {
        return {
            name: 'OMX plugin-cache stale-surface repair',
            ok: true,
            detail: 'skipped (absolute node path unavailable; durable ownership belongs to OMX setup/plugin generation)',
        };
    }
    const repair = options.repair ?? repairInstalledOmxPluginHooks;
    let repairedPaths;
    try {
        repairedPaths = repair(codexHome, nodeBinary);
    }
    catch {
        return {
            name: 'OMX plugin-cache stale-surface repair',
            ok: true,
            detail: 'skipped (could not inspect OMX plugin-cache hooks; durable ownership belongs to OMX setup/plugin generation)',
        };
    }
    if (repairedPaths.length === 0) {
        return {
            name: 'OMX plugin-cache stale-surface repair',
            ok: true,
            detail: 'no positively identified stale OMX plugin-cache hook surfaces; durable ownership belongs to OMX setup/plugin generation',
        };
    }
    return {
        name: 'OMX plugin-cache stale-surface repair',
        ok: true,
        detail: `bounded stale-surface repair rewrote ${repairedPaths.length} positively identified stale ` +
            'OMX plugin-cache hook surface(s); durable ownership belongs to OMX setup/plugin generation',
    };
}
export function checkNativePluginRuntime() {
    const root = resolvePluginRoot();
    if (!root) {
        return {
            name: 'native plugin runtime',
            ok: false,
            detail: formatNativeRuntimeDetail({
                launchMode: 'missing',
                reason: 'plugin root not found',
            }),
        };
    }
    const pluginJsonPath = join(root, '.claude-plugin', 'plugin.json');
    const manifestPath = join(root, 'bin', 'runtime-manifest.json');
    const stagedBinPath = join(root, 'bin', 'wp');
    if (!tryAccess(pluginJsonPath)) {
        return {
            name: 'native plugin runtime',
            ok: false,
            detail: formatNativeRuntimeDetail({
                launchMode: 'missing',
                manifestPath,
                stagedBinPath,
                reason: 'plugin manifest missing',
            }),
        };
    }
    try {
        const pluginManifest = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
        const server = pluginManifest.mcpServers?.webpresso;
        const launchMode = server?.command === '${CLAUDE_PLUGIN_ROOT}/bin/wp' &&
            Array.isArray(server.args) &&
            server.args.length === 1 &&
            server.args[0] === 'mcp'
            ? 'native'
            : server?.command === 'node' || (server?.args ?? []).some((arg) => arg.endsWith('wp.js'))
                ? 'stale-node-launcher'
                : server
                    ? 'custom'
                    : 'missing';
        if (!tryAccess(manifestPath)) {
            return {
                name: 'native plugin runtime',
                ok: false,
                detail: formatNativeRuntimeDetail({
                    launchMode,
                    manifestPath,
                    stagedBinPath,
                    reason: 'runtime manifest missing',
                }),
            };
        }
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const target = manifest.targets?.find((candidate) => candidate.os === process.platform && candidate.cpu === process.arch);
        const targetId = target?.id;
        const targetFilename = target?.os === 'win32' ? `${manifest.binaryName ?? 'wp'}.exe` : (manifest.binaryName ?? 'wp');
        const runtimeTargetPath = targetId
            ? join(root, 'bin', 'runtime', targetId, targetFilename)
            : undefined;
        if (!targetId || !runtimeTargetPath) {
            return {
                name: 'native plugin runtime',
                ok: false,
                detail: formatNativeRuntimeDetail({
                    launchMode,
                    manifestPath,
                    stagedBinPath,
                    reason: `no runtime target for ${process.platform}/${process.arch}`,
                }),
            };
        }
        if (!tryAccess(stagedBinPath)) {
            return {
                name: 'native plugin runtime',
                ok: false,
                detail: formatNativeRuntimeDetail({
                    launchMode,
                    targetId,
                    manifestPath,
                    stagedBinPath,
                    runtimeTargetPath,
                    reason: 'staged native launcher missing',
                }),
            };
        }
        if (lstatSync(stagedBinPath).isSymbolicLink()) {
            return {
                name: 'native plugin runtime',
                ok: false,
                detail: formatNativeRuntimeDetail({
                    launchMode,
                    targetId,
                    manifestPath,
                    stagedBinPath,
                    runtimeTargetPath,
                    reason: 'staged native launcher is a symlink',
                }),
            };
        }
        if (!tryAccess(runtimeTargetPath)) {
            if (launchMode === 'native' && isSourceCheckoutWithRuntimeTooling(root)) {
                return {
                    name: 'native plugin runtime',
                    ok: true,
                    detail: formatNativeRuntimeDetail({
                        launchMode,
                        targetId,
                        manifestPath,
                        stagedBinPath,
                        runtimeTargetPath,
                        reason: 'skipped (source checkout runtime payload not staged; run build:runtime-binaries then stage:plugin-runtime to verify the plugin-native lane locally)',
                    }),
                };
            }
            return {
                name: 'native plugin runtime',
                ok: false,
                detail: formatNativeRuntimeDetail({
                    launchMode,
                    targetId,
                    manifestPath,
                    stagedBinPath,
                    runtimeTargetPath,
                    reason: 'target runtime binary missing',
                }),
            };
        }
        if (launchMode !== 'native') {
            return {
                name: 'native plugin runtime',
                ok: false,
                detail: formatNativeRuntimeDetail({
                    launchMode,
                    targetId,
                    manifestPath,
                    stagedBinPath,
                    runtimeTargetPath,
                    reason: 'plugin manifest is not using the native launcher',
                }),
            };
        }
        return {
            name: 'native plugin runtime',
            ok: true,
            detail: formatNativeRuntimeDetail({
                launchMode,
                targetId,
                manifestPath,
                stagedBinPath,
                runtimeTargetPath,
            }),
        };
    }
    catch (error) {
        return {
            name: 'native plugin runtime',
            ok: false,
            detail: formatNativeRuntimeDetail({
                launchMode: 'missing',
                manifestPath,
                stagedBinPath,
                reason: error instanceof Error ? error.message : String(error),
            }),
        };
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
    return hasAgentKit
        ? { name: 'Codex host integration', ok: true, detail: 'webpresso MCP visible' }
        : {
            name: 'Codex host integration',
            ok: false,
            detail: `missing MCP entry (webpresso=${hasAgentKit})`,
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
    const agentKitConnected = /✓\s+webpresso\b/.test(stdout);
    if (!hasAgentKit) {
        return {
            name: 'OpenCode host integration',
            ok: false,
            detail: `missing MCP entry (webpresso=${hasAgentKit})`,
        };
    }
    return agentKitConnected
        ? {
            name: 'OpenCode host integration',
            ok: true,
            detail: 'webpresso MCP connected',
        }
        : {
            name: 'OpenCode host integration',
            ok: false,
            detail: `MCP not connected (webpresso=${agentKitConnected})`,
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
// Marker for the managed hook launchers `wp setup` writes under
// `.claude/hooks/managed/` (CLAUDE_MANAGED_HOOK_SUBDIR in the agent-hooks
// scaffolder). The plugin manifest no longer ships hooks (they double-fired
// against these and were the less reliable surface), so settings.json is the
// single source — if it does not reference them, the hooks are not installed.
const MANAGED_HOOK_MARKER = 'hooks/managed/wp-pretool-guard';
/**
 * Verify the consumer's `.claude/settings.json` carries the managed agent-kit
 * hook launchers. Since the hooks are single-sourced there (not in the plugin
 * manifest), a missing reference means a plugin-only install that never ran
 * `wp setup` — i.e. no agent-kit hooks are active.
 */
export function checkManagedHooksInstalled(cwd = process.cwd()) {
    const settingsPath = join(cwd, '.claude', 'settings.json');
    if (!tryAccess(settingsPath)) {
        return {
            ok: false,
            detail: 'no .claude/settings.json — run `wp setup` to install the agent-kit hooks',
        };
    }
    try {
        const raw = readFileSync(settingsPath, 'utf-8');
        if (!raw.includes(MANAGED_HOOK_MARKER)) {
            return {
                ok: false,
                detail: 'agent-kit hooks not found in .claude/settings.json — run `wp setup`',
            };
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, detail: `failed to read .claude/settings.json: ${String(err)}` };
    }
}
/**
 * Parse the installed hooks from `.claude/settings.json` into a HooksMap.
 * Returns an empty map when the file is absent or unparseable.
 */
function readInstalledClaudeHooks(cwd) {
    const settingsPath = join(cwd, '.claude', 'settings.json');
    if (!tryAccess(settingsPath))
        return {};
    try {
        const raw = readFileSync(settingsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const result = {};
        for (const [event, groups] of Object.entries(parsed.hooks ?? {})) {
            result[event] = (groups ?? []).map((g) => ({
                ...(g.matcher !== undefined ? { matcher: g.matcher } : {}),
                hooks: (g.hooks ?? []).map((h) => ({
                    type: h.type ?? 'command',
                    command: h.command ?? '',
                    ...(h.timeout !== undefined ? { timeout: h.timeout } : {}),
                })),
            }));
        }
        return result;
    }
    catch {
        return {};
    }
}
/**
 * Parse the installed hooks from `.codex/hooks.json` into a HooksMap.
 * Returns an empty map when the file is absent or unparseable.
 */
function readInstalledCodexHooks(cwd) {
    const hooksPath = join(cwd, '.codex', 'hooks.json');
    if (!tryAccess(hooksPath))
        return {};
    try {
        const raw = readFileSync(hooksPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const result = {};
        for (const [event, groups] of Object.entries(parsed.hooks ?? {})) {
            result[event] = (groups ?? []).map((g) => ({
                ...(g.matcher !== undefined ? { matcher: g.matcher } : {}),
                hooks: (g.hooks ?? []).map((h) => ({
                    type: h.type ?? 'command',
                    command: h.command ?? '',
                    ...(h.timeout !== undefined ? { timeout: h.timeout } : {}),
                })),
            }));
        }
        return result;
    }
    catch {
        return {};
    }
}
/**
 * Compare the installed hooks against the `.webpresso/hooks-manifest.json`.
 * Reports advisory findings per hook entry (ok / missing / unknown).
 * When the manifest is absent, emits a single info-level advisory prompting
 * the user to run `wp setup`.
 */
export function checkHooksManifest(cwd = process.cwd()) {
    const manifest = readHooksManifest(cwd);
    if (manifest === null) {
        const setupCommand = setupCommandForRepo(cwd);
        return {
            name: 'hooks manifest',
            ok: true,
            advisory: true,
            detail: `no .webpresso/hooks-manifest.json — run \`${setupCommand}\` to generate it`,
        };
    }
    const installedClaude = readInstalledClaudeHooks(cwd);
    const installedCodex = readInstalledCodexHooks(cwd);
    const diffs = diffHooksManifest(manifest, { claude: installedClaude, codex: installedCodex });
    const missing = diffs.filter((d) => d.verdict === 'missing');
    const unknown = diffs.filter((d) => d.verdict === 'unknown');
    if (missing.length === 0 && unknown.length === 0) {
        return {
            name: 'hooks manifest',
            ok: true,
            advisory: true,
            detail: `${diffs.length} hook entry/entries match manifest`,
        };
    }
    const parts = [];
    if (missing.length > 0) {
        const restoreCommand = setupCommandForRepo(cwd, { restoreHooks: true });
        const preview = missing
            .slice(0, 2)
            .map((d) => `${d.vendor}/${d.event}`)
            .join(', ');
        parts.push(`${missing.length} missing (${preview}${missing.length > 2 ? ', …' : ''}) — run \`${restoreCommand}\``);
    }
    if (unknown.length > 0) {
        const preview = unknown
            .slice(0, 2)
            .map((d) => `${d.vendor}/${d.event}`)
            .join(', ');
        parts.push(`${unknown.length} unknown (${preview}${unknown.length > 2 ? ', …' : ''}) — hand-edited? review with \`wp hooks status\``);
    }
    return {
        name: 'hooks manifest',
        ok: false,
        advisory: true,
        detail: parts.join('; '),
    };
}
function hooksConfigPath(vendor, cwd) {
    return vendor === 'claude'
        ? join(cwd, '.claude', 'settings.json')
        : join(cwd, '.codex', 'hooks.json');
}
function existingHookConfigPaths(cwd) {
    return ['claude', 'codex']
        .map((vendor) => hooksConfigPath(vendor, cwd))
        .filter((filePath) => tryAccess(filePath));
}
async function defaultRunRestoreFix(cwd) {
    const { runInit } = await import('#cli/commands/init/index.js');
    return await runInit({ cwd, yes: true, restoreHooks: true }, { stdout: { write: () => true } });
}
export function buildHooksDoctorFixPlan(cwd = process.cwd()) {
    const manifest = readHooksManifest(cwd);
    const preservedFiles = existingHookConfigPaths(cwd);
    if (manifest === null) {
        const setupCommand = setupCommandForRepo(cwd);
        return {
            status: 'requires-approval',
            detail: 'no hooks manifest exists; doctor will not run full `wp setup` automatically because that can rewrite broader repo-managed surfaces',
            preservedFiles,
            nextCommand: setupCommand,
        };
    }
    const installedClaude = readInstalledClaudeHooks(cwd);
    const installedCodex = readInstalledCodexHooks(cwd);
    const diffs = diffHooksManifest(manifest, { claude: installedClaude, codex: installedCodex });
    const missing = diffs.filter((d) => d.verdict === 'missing');
    const unknown = diffs.filter((d) => d.verdict === 'unknown');
    if (unknown.length > 0) {
        const affectedFiles = [...new Set(unknown.map((diff) => hooksConfigPath(diff.vendor, cwd)))];
        return {
            status: 'blocked',
            detail: 'installed hooks exist outside the manifest; doctor will not overwrite potentially hand-edited hook config automatically',
            preservedFiles: affectedFiles,
            nextCommand: 'wp hooks status',
        };
    }
    if (missing.length === 0) {
        return {
            status: 'fixed',
            detail: 'managed hooks already match the manifest; no hook restore was needed',
        };
    }
    return {
        status: 'prepared',
        detail: 'managed hooks are missing but the manifest is present and there are no unknown installed hooks; safe restore path is ready',
        preservedFiles,
        nextCommand: setupCommandForRepo(cwd, { restoreHooks: true }),
    };
}
/**
 * Detect competing hook plugins (e.g. oh-my-claudecode / OMC) in the Claude
 * plugin registry and report the expected coexistence model.
 *
 * wp hooks live in `.claude/settings.json` (user-owned). Third-party plugin
 * hooks live inside each plugin's own cache directory. `omc update` replaces
 * the plugin cache but never touches `settings.json`, so wp hooks survive
 * by design. When both run, Claude Code fires all matching PreToolUse hooks
 * concurrently; a deny from either wins.
 */
export function checkThirdPartyHookCoexistence(options = {}) {
    const configDir = options.claudeConfigDir ??
        process.env.CLAUDE_CONFIG_DIR ??
        join(process.env.HOME ?? '', '.claude');
    const registryPath = join(configDir, 'plugins', 'installed_plugins.json');
    if (!tryAccess(registryPath)) {
        return {
            name: 'third-party hook coexistence',
            ok: true,
            detail: 'no Claude plugin registry found; single-plugin mode',
        };
    }
    let omcVersion;
    try {
        const raw = readFileSync(registryPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const omcEntries = parsed.plugins?.['oh-my-claudecode@omc'];
        if (Array.isArray(omcEntries) && omcEntries.length > 0) {
            // Prefer user-scope entry for version label; fall back to first entry
            const userEntry = omcEntries.find((e) => e.scope === 'user') ?? omcEntries[0];
            omcVersion = userEntry?.version;
        }
    }
    catch {
        return {
            name: 'third-party hook coexistence',
            ok: true,
            detail: 'could not read plugin registry; skipped',
        };
    }
    if (!omcVersion) {
        return {
            name: 'third-party hook coexistence',
            ok: true,
            detail: 'no competing hook plugins detected',
        };
    }
    return {
        name: 'third-party hook coexistence',
        ok: true,
        // Concurrent double-fire on PreToolUse is expected: Claude runs all matching
        // hooks from all sources simultaneously; a deny from either wins. wp hooks in
        // settings.json survive omc update because that command only replaces the
        // plugin cache directory, not settings.json.
        detail: `OMC ${omcVersion} detected — concurrent PreToolUse double-fire is expected and idempotent; ` +
            'wp hooks in settings.json survive omc update (separate files)',
    };
}
async function applyHooksDoctorFixPlan(plan, cwd, runRestoreFix) {
    if (plan.status !== 'prepared')
        return plan;
    const exitCode = await runRestoreFix(cwd);
    if (exitCode === 0) {
        return {
            status: 'fixed',
            detail: 'restored managed hooks from the manifest via `wp setup --restore-hooks`',
            preservedFiles: plan.preservedFiles,
        };
    }
    return {
        status: 'blocked',
        detail: `safe restore path failed with exit code ${exitCode}`,
        preservedFiles: plan.preservedFiles,
        nextCommand: plan.nextCommand,
    };
}
export async function runHooksDoctor(opts = {}) {
    const checks = [];
    const isWin = platform() === 'win32';
    const wpCli = resolveWpCliCommand();
    for (const bin of HOOK_BINS) {
        if (!wpCli) {
            checks.push({ name: bin.name, ok: false, detail: "repo 'wp' launcher not found" });
            continue;
        }
        if (!isWin &&
            (wpCli.command.includes('/') || wpCli.command.includes('\\')) &&
            !isExecutable(wpCli.command)) {
            checks.push({ name: bin.name, ok: false, detail: 'exists but not executable' });
            continue;
        }
        const probe = await probeHookBin(wpCli, bin.hookName, bin.checkStdin);
        checks.push({ name: bin.name, ok: probe.ok, detail: probe.detail });
    }
    checks.push(checkConsumerCodexHookPaths(opts.cwd));
    checks.push({ name: 'plugin.json integrity', ...checkPluginJson() });
    checks.push({ advisory: true, ...checkRootLauncherContract() });
    checks.push({ advisory: true, ...checkNativePluginRuntime() });
    checks.push({ advisory: true, ...checkOmxPluginCacheStaleSurfaceRepair() });
    checks.push({ advisory: true, ...checkThirdPartyHookCoexistence() });
    checks.push(operatorPrecedenceCheck());
    checks.push({
        name: 'managed hooks installed (.claude/settings.json)',
        advisory: true,
        ...checkManagedHooksInstalled(opts.cwd),
    });
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
    checks.push(checkHooksManifest(opts.cwd));
    const nonMcpChecks = checks.filter((c) => !c.name.startsWith('MCP ') && !c.advisory);
    const overallOk = nonMcpChecks.every((c) => c.ok);
    return { ok: overallOk, checks };
}
export async function printHooksDoctor(opts = {}) {
    let result = await runHooksDoctor(opts);
    let fixResult = null;
    if (opts.fix) {
        const cwd = opts.cwd ?? process.cwd();
        if (result.ok) {
            fixResult = {
                status: 'fixed',
                detail: 'doctor found no failing non-advisory checks; no changes were needed',
            };
        }
        else {
            const plan = buildHooksDoctorFixPlan(cwd);
            fixResult =
                plan.status === 'fixed'
                    ? {
                        status: 'blocked',
                        detail: 'doctor found failing checks outside the safe manifest-restore path; no automatic fix was applied',
                        nextCommand: 'wp hooks doctor',
                    }
                    : await applyHooksDoctorFixPlan(plan, cwd, opts.runRestoreFix ?? defaultRunRestoreFix);
            if (fixResult.status === 'fixed') {
                result = await runHooksDoctor({ ...opts, fix: false, runRestoreFix: undefined });
            }
        }
    }
    for (const check of result.checks) {
        const icon = check.ok ? '[x]' : '[ ]';
        const detail = check.detail ? `: ${check.detail}` : '';
        console.error(`${icon} ${check.name}${detail}`);
    }
    if (fixResult) {
        console.error('');
        console.error(`[~] hooks fix: ${fixResult.status}: ${fixResult.detail}`);
        if ((fixResult.preservedFiles?.length ?? 0) > 0) {
            console.error(`    preserved: ${fixResult.preservedFiles.join(', ')}`);
        }
        if (fixResult.nextCommand) {
            console.error(`    next: ${fixResult.nextCommand}`);
        }
    }
    console.error('');
    console.error('Operator flow:');
    console.error(`  • ${OPERATOR_PRECEDENCE_DETAIL}`);
    console.error('  • After `wp setup`, run `wp hooks doctor` as the canonical success check.');
    console.error('  • First host success: ask Claude or Codex to run `wp_audit(kind="docs-frontmatter")`.');
    if (!result.ok) {
        console.error('');
        console.error('Repair hints:');
        console.error('  • Refresh local hook/plugin surfaces: `wp setup`');
        console.error('  • If live-source linking is broken: `vp install` or `vp run dev:link --consumer <repo>`');
        console.error('  • If install failed resolving @webpresso/agent-kit: make sure this repo uses the public npm registry, then rerun `vp install`');
    }
    return result.ok ? 0 : 1;
}
//# sourceMappingURL=doctor.js.map