import type { MergeOptions } from '#cli/commands/init/merge';
export declare const PLAYWRIGHT_MCP_SERVER_NAME = "playwright";
export declare const PLAYWRIGHT_MCP_HEADER = "[mcp_servers.playwright]";
export declare const PLAYWRIGHT_MCP_BLOCK = "[mcp_servers.playwright]\ncommand = \"npx\"\nargs = [\"-y\", \"@playwright/mcp@latest\", \"--caps=testing,storage,network,devtools\"]\nenabled = true\nstartup_timeout_sec = 30\n";
export declare const AGENT_KIT_MCP_SERVER_NAME = "agent-kit";
export declare const AGENT_KIT_MCP_HEADER = "[mcp_servers.agent-kit]";
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
export interface AgentKitInstallProbe {
    /** Test seam — override the candidate roots. Default: probe in fixed order. */
    candidates?: readonly string[];
    /** Test seam — return value for `pnpm root -g`. Default: shell out. */
    pnpmGlobalRoot?: () => string | null;
    /** Test seam — return value for `npm root -g`. Default: shell out. */
    npmGlobalRoot?: () => string | null;
}
/**
 * Resolve the absolute path to agent-kit's MCP entry on this machine. Probes
 * the locations consumers use to install agent-kit, in order of stability:
 *
 *   1. Claude plugin install — `~/.claude/plugins/cache/agent-kit/agent-kit/`
 *      (path-stable; updated by Claude Code's plugin manager)
 *   2. bun global — `~/.bun/install/global/node_modules/@webpresso/agent-kit/`
 *   3. pnpm global — `$(pnpm root -g)/@webpresso/agent-kit/`
 *   4. npm global — `$(npm root -g)/@webpresso/agent-kit/`
 *
 * Returns `null` when none of the candidates contain `src/mcp/cli.ts`. The
 * caller surfaces a clear error in that case rather than writing a broken
 * codex config.
 */
export declare function findAgentKitMcpEntry(probe?: AgentKitInstallProbe): string | null;
export declare function agentKitMcpLaunchCommand(entryPath: string): {
    command: 'bun' | 'node';
    args: string[];
};
export declare function agentKitMcpBlock(entryPath: string): string;
export declare function upsertAgentKitMcpServer(raw: string, entryPath: string): string;
export interface EnsureCodexAgentKitMcpInput {
    options: MergeOptions;
    /** Test seam — override the resolved MCP entry path. */
    entryPath?: string;
    /** Test seam — override `$CODEX_HOME/config.toml`. */
    configPath?: string;
    /** Test seam — override the install-discovery probe. */
    probe?: AgentKitInstallProbe;
}
export type EnsureCodexAgentKitMcpResult = {
    kind: 'codex-agent-kit-mcp-written';
    path: string;
    entryPath: string;
} | {
    kind: 'codex-agent-kit-mcp-unchanged';
    path: string;
    entryPath: string;
} | {
    kind: 'codex-agent-kit-mcp-skipped-dry-run';
    path: string;
} | {
    kind: 'codex-agent-kit-mcp-not-installed';
    path: string;
    checked: readonly string[];
};
export declare function ensureCodexAgentKitMcp(input: EnsureCodexAgentKitMcpInput): EnsureCodexAgentKitMcpResult;
//# sourceMappingURL=index.d.ts.map