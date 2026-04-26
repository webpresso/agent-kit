/**
 * `ak mcp` stdio server.
 *
 * Builds an MCP {@link Server} and auto-registers every tool found under
 * `src/mcp/tools/` (or, post-build, `dist/esm/mcp/tools/`). Adding a new tool
 * is a matter of dropping a file with a default-exported {@link ToolDescriptor}
 * — no edits required here.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
export interface CreateServerOptions {
    /**
     * Directory to scan for tool descriptors. Defaults to `./tools` relative to
     * this module — i.e. `src/mcp/tools/` in dev and `dist/esm/mcp/tools/` after
     * `pnpm build`.
     */
    toolsDir?: string;
}
export declare function createServer(options?: CreateServerOptions): Promise<Server>;
//# sourceMappingURL=server.d.ts.map