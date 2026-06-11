import type { MergeOptions, MergeResult } from '#cli/commands/init/merge';
export declare const PLAYWRIGHT_MCP_SERVER_NAME = "playwright";
export declare const PLAYWRIGHT_MCP_HEADER = "[mcp_servers.playwright]";
export declare const PLAYWRIGHT_MCP_BLOCK: string;
export declare const WEBPRESSO_MCP_SERVER_NAME = "webpresso";
export declare const WEBPRESSO_MCP_HEADER = "[mcp_servers.webpresso]";
export interface EnsureCodexPlaywrightMcpInput {
    options: MergeOptions;
    /** Test seam. Defaults to `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. */
    configPath?: string;
}
export type EnsureCodexPlaywrightMcpResult = {
    kind: 'codex-playwright-mcp-written';
    path: string;
} | {
    kind: 'codex-playwright-mcp-unchanged';
    path: string;
} | {
    kind: 'codex-playwright-mcp-skipped-dry-run';
    path: string;
};
export declare function upsertPlaywrightMcpServer(raw: string): string;
export declare function ensureCodexPlaywrightMcp(input: EnsureCodexPlaywrightMcpInput): EnsureCodexPlaywrightMcpResult;
/**
 * Upsert the `playwright` server into a `.mcp.json` document, preserving every
 * other server (e.g. `context7`, `exa`) and any non-server top-level keys.
 * Output is normalized to 2-space JSON with a trailing newline so repeated runs
 * converge — idempotent after the first write.
 */
export declare function upsertClaudePlaywrightMcpServer(raw: string): string;
export interface EnsureClaudePlaywrightMcpInput {
    options: MergeOptions;
    /** Project root whose `.mcp.json` is managed. */
    repoRoot: string;
    /** Test seam. Defaults to `<repoRoot>/.mcp.json`. */
    configPath?: string;
}
export type EnsureClaudePlaywrightMcpResult = {
    kind: 'claude-playwright-mcp-written';
    path: string;
} | {
    kind: 'claude-playwright-mcp-unchanged';
    path: string;
} | {
    kind: 'claude-playwright-mcp-skipped-dry-run';
    path: string;
} | {
    kind: 'claude-playwright-mcp-invalid-json';
    path: string;
};
export declare function ensureClaudePlaywrightMcp(input: EnsureClaudePlaywrightMcpInput): EnsureClaudePlaywrightMcpResult;
export interface WebpressoInstallProbe {
    /** Test seam — override the candidate roots. Default: probe in fixed order. */
    candidates?: readonly string[];
    /** Test seam — return value for `pnpm root -g`. Default: shell out. */
    pnpmGlobalRoot?: () => string | null;
    /** Test seam — return value for `npm root -g`. Default: shell out. */
    npmGlobalRoot?: () => string | null;
}
/**
 * Resolve the absolute path to webpresso's MCP entry on this machine. Probes
 * the locations consumers use to install webpresso, in order of stability:
 *
 *   1. Claude plugin install — `~/.claude/plugins/cache/webpresso/webpresso/`
 *      (path-stable; updated by Claude Code's plugin manager)
 *   2. bun global — `~/.bun/install/global/node_modules/@webpresso/webpresso/`
 *   3. pnpm global — `$(pnpm root -g)/@webpresso/webpresso/`
 *   4. npm global — `$(npm root -g)/@webpresso/webpresso/`
 *
 * Returns `null` when none of the candidates contain `src/mcp/cli.ts`. The
 * caller surfaces a clear error in that case rather than writing a broken
 * codex config.
 */
export declare function findWebpressoMcpEntry(probe?: WebpressoInstallProbe): string | null;
export declare function agentKitMcpLaunchCommand(entryPath: string): {
    command: 'bun' | 'node';
    args: string[];
};
export declare function agentKitMcpBlock(entryPath: string): string;
export declare function upsertWebpressoMcpServer(raw: string, entryPath: string): string;
export interface EnsureCodexWebpressoMcpInput {
    options: MergeOptions;
    /** Test seam — override the resolved MCP entry path. */
    entryPath?: string;
    /** Test seam — override `$CODEX_HOME/config.toml`. */
    configPath?: string;
    /** Test seam — override the install-discovery probe. */
    probe?: WebpressoInstallProbe;
}
export type EnsureCodexWebpressoMcpResult = {
    kind: 'codex-webpresso-mcp-written';
    path: string;
    entryPath: string;
} | {
    kind: 'codex-webpresso-mcp-unchanged';
    path: string;
    entryPath: string;
} | {
    kind: 'codex-webpresso-mcp-skipped-dry-run';
    path: string;
} | {
    kind: 'codex-webpresso-mcp-not-installed';
    path: string;
    checked: readonly string[];
};
export declare function ensureCodexWebpressoMcp(input: EnsureCodexWebpressoMcpInput): EnsureCodexWebpressoMcpResult;
export declare const CONTEXT_MODE_MCP_SERVER_NAME = "context-mode";
export declare const CONTEXT_MODE_MCP_HEADER = "[mcp_servers.context-mode]";
export declare const CONTEXT_MODE_MCP_BLOCK = "[mcp_servers.context-mode]\ncommand = \"context-mode\"\n";
export declare function upsertContextModeMcpServer(raw: string): string;
export interface EnsureCodexContextModeMcpInput {
    options: MergeOptions;
    /** Test seam. Defaults to `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. */
    configPath?: string;
}
export declare function ensureCodexContextModeMcp(input: EnsureCodexContextModeMcpInput): MergeResult;
export declare const CONTEXT7_MCP_SERVER_NAME = "context7";
export declare const CONTEXT7_API_KEY_ENV = "CONTEXT7_API_KEY";
export declare const CONTEXT7_MCP_URL = "https://mcp.context7.com/mcp";
export declare const CONTEXT7_MCP_HEADER = "[mcp_servers.context7]";
export declare const CONTEXT7_MCP_BLOCK = "[mcp_servers.context7]\nurl = \"https://mcp.context7.com/mcp\"\nenv_http_headers = { \"CONTEXT7_API_KEY\" = \"CONTEXT7_API_KEY\" }\nenabled = true\n";
export declare function upsertContext7McpServer(raw: string): string;
export interface EnsureCodexContext7McpInput {
    options: MergeOptions;
    /** Test seam. Defaults to `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. */
    configPath?: string;
}
export declare function ensureCodexContext7Mcp(input: EnsureCodexContext7McpInput): MergeResult;
export declare const CLAUDE_CONTEXT7_API_KEY_REF = "${CONTEXT7_API_KEY}";
export declare function upsertClaudeContext7McpServer(raw: string): string;
export interface EnsureClaudeContext7McpInput {
    options: MergeOptions;
    /** Project root whose `.mcp.json` is managed. */
    repoRoot: string;
    /** Test seam. Defaults to `<repoRoot>/.mcp.json`. */
    configPath?: string;
}
export type EnsureClaudeContext7McpResult = {
    kind: 'claude-context7-mcp-written';
    path: string;
} | {
    kind: 'claude-context7-mcp-unchanged';
    path: string;
} | {
    kind: 'claude-context7-mcp-skipped-dry-run';
    path: string;
} | {
    kind: 'claude-context7-mcp-invalid-json';
    path: string;
};
export declare function ensureClaudeContext7Mcp(input: EnsureClaudeContext7McpInput): EnsureClaudeContext7McpResult;
//# sourceMappingURL=index.d.ts.map