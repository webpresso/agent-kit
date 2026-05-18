#!/usr/bin/env bun
/**
 * `ak mcp` — stdio MCP server entrypoint.
 *
 * Spins up the `agent-kit` MCP server with auto-discovered tools and connects
 * it to a stdio transport. Each tool is a single file under
 * `dist/esm/mcp/tools/*.js` (post-build) or `src/mcp/tools/*.ts` (dev).
 */
export declare function runStdioServer(): Promise<void>;
//# sourceMappingURL=cli.d.ts.map