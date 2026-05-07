/**
 * `ak_qa` MCP tool.
 *
 * Composite tool that fans out to the three sibling check tools in parallel
 * via `Promise.all` and returns an aggregated structured payload:
 *
 *   {
 *     passed: lint.passed && typecheck.passed && test.passed,
 *     lint: <ak_lint payload>,
 *     typecheck: <ak_typecheck payload>,
 *     test: <ak_test payload>,
 *   }
 *
 * Implementation calls the sibling tools' `handler` exports through their
 * default descriptors — no public re-exports needed. Parallelism is the whole
 * point: a sequential composite would be strictly worse than the user just
 * running each tool back-to-back, since the sub-tools each spawn long-lived
 * external processes (`oxlint`, `tsc`, the test runner). Running them
 * concurrently is the only thing this composite buys you.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type AkQaInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=qa.d.ts.map