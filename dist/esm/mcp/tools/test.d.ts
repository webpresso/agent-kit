/**
 * `ak_test` MCP tool.
 *
 * Routes test execution to either `just` (when a `justfile` is present in cwd)
 * or `pnpm` (when only `pnpm-workspace.yaml` is present), with an explicit
 * `backend` override. Returns a summary-first payload with bounded `rawOutput`.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    backend: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        pnpm: "pnpm";
        just: "just";
    }>>>;
}, z.core.$strict>;
export type AkTestInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=test.d.ts.map