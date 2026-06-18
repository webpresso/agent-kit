import type { ToolDescriptor, ToolHandlerExtra, ToolHandlerResult } from '#mcp/auto-discover';
export interface SessionFetchAndIndexDeps {
    readonly fetchImpl?: typeof fetch;
}
export declare function handleSessionFetchAndIndex(raw: unknown, extra?: ToolHandlerExtra, deps?: SessionFetchAndIndexDeps): Promise<ToolHandlerResult>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=session-fetch-and-index.d.ts.map