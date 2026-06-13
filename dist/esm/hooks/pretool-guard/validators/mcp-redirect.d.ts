import type { CommandCategory } from './forbidden-commands.js';
export interface MCPRedirectConfig {
    serverName?: string;
    toolPrefix?: string;
}
export interface MCPRedirectContext {
    category: CommandCategory;
    command: string;
    mcpReady?: boolean | (() => boolean);
    fallbackHint?: string;
    mcp?: MCPRedirectConfig;
}
export declare function resolveMcpReady(value: MCPRedirectContext['mcpReady']): boolean;
export declare function resolveMcpConfig(mcp: MCPRedirectContext['mcp']): Required<MCPRedirectConfig>;
export declare function buildRedirectMessage(ctx: MCPRedirectContext): string;
//# sourceMappingURL=mcp-redirect.d.ts.map