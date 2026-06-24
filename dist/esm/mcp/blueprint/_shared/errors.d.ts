import type { ToolHandlerResult } from '#mcp/auto-discover.js';
export declare function jsonContent(payload: unknown, isError?: boolean): ToolHandlerResult;
export declare function parseStructuredJson(result: ToolHandlerResult): Record<string, unknown>;
export declare function err(summary: string, error: string): ToolHandlerResult;
export declare function finishPayload(payload: Record<string, unknown>): ToolHandlerResult;
//# sourceMappingURL=errors.d.ts.map