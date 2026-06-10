import type { MergeOptions } from '#cli/commands/init/merge';
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
 *   2. bun global — `~/.bun/install/global/node_modules/webpresso/`
 *   3. pnpm global — `$(pnpm root -g)/webpresso/`
 *   4. npm global — `$(npm root -g)/webpresso/`
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
//# sourceMappingURL=index.d.ts.map