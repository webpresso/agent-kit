/**
 * `codex-mcp` scaffolder preset.
 *
 * Codex and OMX both resolve persistent MCP servers from Codex's config home
 * (`$CODEX_HOME/config.toml`, falling back to `~/.codex/config.toml`).  Keep
 * the patch tiny and deterministic: one owned Playwright MCP table, no TOML
 * parser dependency, and no edits to unrelated user config.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
export const PLAYWRIGHT_MCP_SERVER_NAME = 'playwright';
export const PLAYWRIGHT_MCP_HEADER = `[mcp_servers.${PLAYWRIGHT_MCP_SERVER_NAME}]`;
export const PLAYWRIGHT_MCP_BLOCK = `${PLAYWRIGHT_MCP_HEADER}
command = "npx"
args = ["-y", "@playwright/mcp@latest", "--caps=testing,storage,network,devtools"]
enabled = true
startup_timeout_sec = 30
`;
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
//# sourceMappingURL=index.js.map