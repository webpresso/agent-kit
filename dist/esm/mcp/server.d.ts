/**
 * `wp mcp` stdio server.
 *
 * Builds an MCP {@link Server} and auto-registers every tool found under
 * `src/mcp/tools/` (or, post-build, `dist/esm/mcp/tools/`). Adding a new tool
 * is a matter of dropping a file with a default-exported {@link ToolDescriptor}
 * — no edits required here.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
export declare function isBunSingleFileModuleUrl(moduleUrl: string): boolean;
export type ToolLoadMode = "filesystem" | "registry";
export declare function resolveDefaultToolLoadMode(moduleUrl?: string): ToolLoadMode;
export interface CreateServerOptions {
    /**
     * Directory to scan for tool descriptors. Defaults to `./tools` relative to
     * this module — i.e. `src/mcp/tools/` in dev and `dist/esm/mcp/tools/` after
     * `vp run build`.
     */
    toolsDir?: string;
    /**
     * Tool loading strategy. Use `registry` for compiled runtime execution where
     * runtime directory scans are unsafe, and `filesystem` for dev/test disk
     * discovery.
     */
    toolLoadMode?: ToolLoadMode;
    /**
     * Repo working directory passed through to the blueprint structured-store
     * registrar (Task 2.1). Defaults to `process.cwd()`. Tests inject a tmpdir.
     */
    cwd?: string;
}
export declare function createServer(options?: CreateServerOptions): Promise<Server>;
//# sourceMappingURL=server.d.ts.map