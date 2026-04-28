/**
 * `ak_test` MCP tool.
 *
 * Routes test execution to either `just` (when a `justfile` is present in cwd)
 * or `pnpm` (when only `pnpm-workspace.yaml` is present), with an explicit
 * `backend` override. Returns a structured `{passed, output, exitCode}` payload
 * wrapped in MCP `text` content blocks.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    suite: z.ZodOptional<z.ZodEnum<{
        e2e: "e2e";
        unit: "unit";
        integration: "integration";
    }>>;
    backend: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        pnpm: "pnpm";
        just: "just";
        auto: "auto";
    }>>>;
}, z.core.$strip>;
export type AkTestInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=test.d.ts.map