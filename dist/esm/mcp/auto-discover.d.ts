/**
 * Tool auto-discovery for the `ak mcp` server.
 *
 * Scans a directory for `*.ts` (source) or `*.js` (built) files, dynamic-imports
 * each, and registers any default-exported {@link ToolDescriptor} on the
 * provided server. Skips test files (`*.test.*`, `*.integration.test.*`) and
 * type-declaration files.
 *
 * Adding a new tool is a one-file affair: drop `src/mcp/tools/<name>.ts` with a
 * default export and the server picks it up at startup. No edits to
 * `server.ts` required.
 */
import { type ZodType } from 'zod';
export interface ContentBlock {
    readonly type: string;
    readonly text?: string;
    readonly [key: string]: unknown;
}
export interface ToolHandlerResult {
    readonly content: readonly ContentBlock[];
    readonly isError?: boolean;
}
export interface ToolDescriptor {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: ZodType<unknown> | {
        _def: unknown;
        parse: (x: unknown) => unknown;
    };
    readonly handler: (input: unknown) => Promise<ToolHandlerResult>;
}
/**
 * Minimal server contract used by the auto-discovery loop. The real MCP
 * `Server` instance and `McpServer` instance both implement a richer surface,
 * but discovery only needs `registerTool`. Keeping the shape minimal makes the
 * function trivially fakeable in tests.
 */
export interface ToolRegistrar {
    registerTool(name: string, description: string, jsonSchema: Record<string, unknown>, handler: (input: unknown) => Promise<ToolHandlerResult>): void;
}
export declare function discoverTools(server: ToolRegistrar, toolsDir: string): Promise<ToolDescriptor[]>;
//# sourceMappingURL=auto-discover.d.ts.map