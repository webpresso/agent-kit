/**
 * `codex-mcp` scaffolder preset.
 *
 * Codex and OMX both resolve persistent MCP servers from Codex's config home
 * (`$CODEX_HOME/config.toml`, falling back to `~/.codex/config.toml`).  Keep
 * the patch tiny and deterministic: per-server upserts, no TOML parser
 * dependency, no edits to unrelated user config.
 *
 * Two managed blocks today:
 *   1. `[mcp_servers.playwright]` — points at the npm-published Playwright
 *      MCP server through Vite+'s `vp dlx` facade.
 *   2. `[mcp_servers.webpresso]` — points at webpresso's own MCP server.
 *      Path-stability requires discovery: webpresso lives in different
 *      locations depending on how the user installed it (Claude plugin
 *      install, bun global, pnpm/npm global). Discovery happens at scaffold
 *      time; the resolved absolute path is written into the codex config.
 *      When the unified-cli sibling cutover lands (`webpresso mcp serve`
 *      from a path-stable bin), this block collapses to a fixed `command`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
export const PLAYWRIGHT_MCP_SERVER_NAME = 'playwright';
export const PLAYWRIGHT_MCP_HEADER = `[mcp_servers.${PLAYWRIGHT_MCP_SERVER_NAME}]`;
export const PLAYWRIGHT_MCP_BLOCK = `${PLAYWRIGHT_MCP_HEADER}
command = "vp"
args = ["dlx", "@playwright/mcp@latest", "--caps=testing,storage,network,devtools"]
enabled = true
startup_timeout_sec = 30
`;
export const WEBPRESSO_MCP_SERVER_NAME = 'webpresso';
export const WEBPRESSO_MCP_HEADER = `[mcp_servers.${WEBPRESSO_MCP_SERVER_NAME}]`;
function defaultConfigPath() {
    const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex');
    return join(codexHome, 'config.toml');
}
export function upsertPlaywrightMcpServer(raw) {
    const lines = raw.trimEnd().split(/\r?\n/);
    const hasContent = raw.trim().length > 0;
    const start = lines.findIndex((line) => line.trim() === PLAYWRIGHT_MCP_HEADER);
    if (start === -1) {
        const prefix = hasContent ? `${raw.trimEnd()}\n\n` : '';
        return `${prefix}${PLAYWRIGHT_MCP_BLOCK}`;
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
        ...PLAYWRIGHT_MCP_BLOCK.trimEnd().split('\n'),
        ...lines.slice(end),
    ].join('\n') + '\n');
}
export function ensureCodexPlaywrightMcp(input) {
    const configPath = input.configPath ?? defaultConfigPath();
    if (input.options.dryRun) {
        return { kind: 'codex-playwright-mcp-skipped-dry-run', path: configPath };
    }
    const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
    const next = upsertPlaywrightMcpServer(existing);
    if (next === existing) {
        return { kind: 'codex-playwright-mcp-unchanged', path: configPath };
    }
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, 'utf8');
    return { kind: 'codex-playwright-mcp-written', path: configPath };
}
// ────────────────────────────────────────────────────────────────────────────
// Agent-kit MCP server registration
// ────────────────────────────────────────────────────────────────────────────
const SOURCE_MCP_ENTRY_RELATIVE = join('src', 'mcp', 'cli.ts');
const BUILT_MCP_ENTRY_RELATIVE = join('dist', 'esm', 'mcp', 'cli.js');
/**
 * Resolve the absolute path to webpresso's MCP entry on this machine. Probes
 * the locations consumers use to install webpresso, in order of stability:
 *
 *   1. Claude plugin install — `~/.claude/plugins/cache/webpresso/webpresso/`
 *      (path-stable; updated by Claude Code's plugin manager)
 *   2. bun global — `~/.bun/install/global/node_modules/webpresso/`
 *   3. pnpm global — `$(pnpm root -g)/webpresso/`
 *   4. npm global — `$(npm root -g)/webpresso/`
 *
 * Returns `null` when none of the candidates contain `src/mcp/cli.ts`. The
 * caller surfaces a clear error in that case rather than writing a broken
 * codex config.
 */
export function findWebpressoMcpEntry(probe = {}) {
    const candidates = probe.candidates ?? defaultCandidates(probe);
    for (const root of candidates) {
        if (!root)
            continue;
        const sourceEntry = join(root, SOURCE_MCP_ENTRY_RELATIVE);
        if (existsSync(sourceEntry))
            return sourceEntry;
        const builtEntry = join(root, BUILT_MCP_ENTRY_RELATIVE);
        if (existsSync(builtEntry))
            return builtEntry;
    }
    return null;
}
function defaultCandidates(probe) {
    const home = process.env.HOME || homedir();
    const claudePlugin = join(home, '.claude', 'plugins', 'cache', 'webpresso', 'webpresso');
    const bunGlobal = join(home, '.bun', 'install', 'global', 'node_modules', '@webpresso', 'webpresso');
    const pnpmRoot = (probe.pnpmGlobalRoot ?? probePnpmGlobalRoot)();
    const npmRoot = (probe.npmGlobalRoot ?? probeNpmGlobalRoot)();
    return [
        claudePlugin,
        bunGlobal,
        pnpmRoot ? join(pnpmRoot, '@webpresso', 'webpresso') : '',
        npmRoot ? join(npmRoot, '@webpresso', 'webpresso') : '',
    ];
}
function probePnpmGlobalRoot() {
    return runQuiet('pnpm', ['root', '-g']);
}
function probeNpmGlobalRoot() {
    return runQuiet('npm', ['root', '-g']);
}
function runQuiet(cmd, args) {
    try {
        const output = execFileSync(cmd, [...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const trimmed = output.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    catch {
        return null;
    }
}
export function agentKitMcpLaunchCommand(entryPath) {
    return entryPath.endsWith('.ts')
        ? { command: 'bun', args: [entryPath] }
        : { command: 'node', args: [entryPath] };
}
export function agentKitMcpBlock(entryPath) {
    const launch = agentKitMcpLaunchCommand(entryPath);
    return `${WEBPRESSO_MCP_HEADER}
command = "${launch.command}"
args = [${launch.args.map((arg) => `"${arg}"`).join(', ')}]
enabled = true
`;
}
export function upsertWebpressoMcpServer(raw, entryPath) {
    const block = agentKitMcpBlock(entryPath);
    const lines = raw.trimEnd().split(/\r?\n/);
    const hasContent = raw.trim().length > 0;
    const start = lines.findIndex((line) => line.trim() === WEBPRESSO_MCP_HEADER);
    if (start === -1) {
        const prefix = hasContent ? `${raw.trimEnd()}\n\n` : '';
        return `${prefix}${block}`;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
        if (lines[i].trim().startsWith('[')) {
            end = i;
            break;
        }
    }
    return ([...lines.slice(0, start), ...block.trimEnd().split('\n'), ...lines.slice(end)].join('\n') +
        '\n');
}
export function ensureCodexWebpressoMcp(input) {
    const configPath = input.configPath ?? defaultConfigPath();
    if (input.options.dryRun) {
        return { kind: 'codex-webpresso-mcp-skipped-dry-run', path: configPath };
    }
    const entryPath = input.entryPath ?? findWebpressoMcpEntry(input.probe);
    if (!entryPath) {
        const checked = (input.probe?.candidates ?? defaultCandidates(input.probe ?? {})).filter((p) => Boolean(p));
        return { kind: 'codex-webpresso-mcp-not-installed', path: configPath, checked };
    }
    const existing = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
    const next = upsertWebpressoMcpServer(existing, entryPath);
    if (next === existing) {
        return { kind: 'codex-webpresso-mcp-unchanged', path: configPath, entryPath };
    }
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, 'utf8');
    return { kind: 'codex-webpresso-mcp-written', path: configPath, entryPath };
}
//# sourceMappingURL=index.js.map