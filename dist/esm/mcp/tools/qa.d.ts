/**
 * `wp_qa` MCP tool.
 *
 * Composite tool that fans out to the three sibling check tools in parallel
 * via `Promise.all` and returns an aggregated structured payload:
 *
 *   {
 *     passed: lint.passed && typecheck.passed && test.passed,
 *     lint: <wp_lint payload>,
 *     typecheck: <wp_typecheck payload>,
 *     test: <wp_test payload>,
 *   }
 *
 * Implementation calls the sibling tools' `handler` exports through their
 * default descriptors — no public re-exports needed. Parallelism is the whole
 * point: a sequential composite would be strictly worse than the user simply
 * running each tool back-to-back, since the sub-tools each spawn long-lived
 * external processes (`oxlint`, `tsc`, the test runner). Running them
 * concurrently is the only thing this composite buys you.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    suite: z.ZodOptional<z.ZodEnum<{
        integration: "integration";
        all: "all";
        unit: "unit";
    }>>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
    workspaceSharding: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        minFilesToShard: z.ZodOptional<z.ZodNumber>;
        targetFilesPerShard: z.ZodOptional<z.ZodNumber>;
        maxShards: z.ZodOptional<z.ZodNumber>;
        concurrency: z.ZodOptional<z.ZodNumber>;
        totalBudgetMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
    full: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export type AkQaInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=qa.d.ts.map