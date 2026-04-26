/**
 * `ak_typecheck` MCP tool.
 *
 * Runs `tsc --noEmit` either at cwd (no `packages` given) or once per
 * resolved package path (each becomes `tsc --noEmit -p <pkg>/tsconfig.json`).
 * Captures stdout (which is where `tsc` emits diagnostics) and parses
 * structured `{file, line, code, message}` entries from the standard
 * `<file>(<line>,<col>): error TS<code>: <message>` format. Returns the
 * aggregated payload `{passed, errorCount, errors, output}` wrapped in MCP
 * `text` content blocks.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '../auto-discover.js';
declare const inputSchema: z.ZodObject<{
    packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type AkTypecheckInput = z.infer<typeof inputSchema>;
export interface TscError {
    readonly file: string;
    readonly line: number;
    readonly code: string;
    readonly message: string;
}
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=typecheck.d.ts.map