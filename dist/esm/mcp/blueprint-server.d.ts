/**
 * Blueprint structured-store MCP server — 8 tools for the blueprint DB.
 *
 * Call `registerBlueprintTools(registrar, cwd)` from server startup.
 * It calls `coldStartIfNeeded` once then registers all 8 tools.
 *
 * All outputs honour the summary-first envelope: { summary, failures, bytes, tokensSaved }
 */
import type { ToolRegistrar } from './auto-discover.js';
export declare function registerBlueprintTools(registrar: ToolRegistrar, cwd: string): Promise<void>;
//# sourceMappingURL=blueprint-server.d.ts.map