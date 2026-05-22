/**
 * `ak_lint` MCP tool.
 *
 * Runs `vp lint` on the supplied files (or `.` when none are given). Returns a
 * structured payload:
 *
 *   {
 *     passed: boolean,
 *     issues: Array<{file, line, rule, message}>,
 *     exitCode: number,
 *   }
 *
 * `vp lint --format=json` forwards to the bundled Oxlint engine while keeping
 * the repo command surface on the `vp` facade.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    fix: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export type AkLintInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=lint.d.ts.map