/**
 * Tool auto-discovery for the `wp mcp` server.
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
    readonly structuredContent?: Record<string, unknown>;
    readonly isError?: boolean;
}
/**
 * MCP tool annotations (spec 2025-03-26). Servers MUST opt into read-only /
 * idempotent / closed-world; clients otherwise pessimize and gate every call
 * behind a confirmation prompt. Set explicitly per tool — defaults are
 * intentionally pessimistic.
 */
export interface ToolAnnotations {
    readonly title?: string;
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
    readonly idempotentHint?: boolean;
    readonly openWorldHint?: boolean;
}
export interface ToolHandlerExtra {
    readonly signal?: AbortSignal;
}
export type ToolHandler = (input: unknown, extra?: ToolHandlerExtra) => Promise<ToolHandlerResult>;
export interface ToolDescriptor {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: ZodType<unknown> | {
        _def: unknown;
        parse: (x: unknown) => unknown;
    };
    readonly outputSchema?: ZodType<unknown> | {
        _def: unknown;
        parse: (x: unknown) => unknown;
    };
    readonly handler: ToolHandler;
    readonly annotations?: ToolAnnotations;
}
/**
 * Minimal server contract used by the auto-discovery loop. The real MCP
 * `Server` instance and `McpServer` instance both implement a richer surface,
 * but discovery only needs `registerTool`. Keeping the shape minimal makes the
 * function trivially fakeable in tests.
 */
export interface ToolRegistrar {
    registerTool(name: string, description: string, jsonSchema: Record<string, unknown>, outputSchema: Record<string, unknown> | undefined, handler: ToolHandler, annotations?: ToolAnnotations): void;
}
export declare function registerToolDescriptor(server: ToolRegistrar, descriptor: ToolDescriptor): ToolDescriptor;
export declare function registerToolDescriptors(server: ToolRegistrar, descriptors: readonly ToolDescriptor[]): ToolDescriptor[];
export declare function discoverTools(server: ToolRegistrar, toolsDir: string): Promise<ToolDescriptor[]>;
//# sourceMappingURL=auto-discover.d.ts.map