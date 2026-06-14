/**
 * `wp_test` MCP tool.
 *
 * Routes test execution through the `vp` package-manager facade and returns a
 * summary-first payload with bounded `rawOutput`.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    suite: z.ZodOptional<z.ZodEnum<{
        integration: "integration";
        all: "all";
        unit: "unit";
    }>>;
    packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    workspaceSharding: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        minFilesToShard: z.ZodOptional<z.ZodNumber>;
        targetFilesPerShard: z.ZodOptional<z.ZodNumber>;
        maxShards: z.ZodOptional<z.ZodNumber>;
        concurrency: z.ZodOptional<z.ZodNumber>;
        totalBudgetMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type AkTestInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=test.d.ts.map