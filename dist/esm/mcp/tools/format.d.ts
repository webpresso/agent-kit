/**
 * `ak_format` MCP tool.
 *
 * Runs `oxfmt` on the resolved project root. By default writes fixes in
 * place; pass `check: true` to verify formatting without writing (useful
 * for CI / pre-commit). Returns the standard summary-first payload:
 *
 *   {
 *     passed: boolean,
 *     summary: string,
 *     exitCode: number,
 *     details: { spawnError?: string },
 *   }
 *
 * No fallback — `oxfmt` must be on PATH. When missing, the tool returns
 * `isError: true` with a clear install hint.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    check: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cwd: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AkFormatInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=format.d.ts.map