/**
 * `wp_e2e` MCP tool.
 *
 * First-class E2E execution surface backed by the existing portable `wp e2e`
 * planner and host-adapter architecture. This tool is suite-aware and should
 * be used for E2E execution instead of overloading `wp_test`.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    suite: z.ZodOptional<z.ZodString>;
    runner: z.ZodOptional<z.ZodEnum<{
        command: "command";
        vitest: "vitest";
        playwright: "playwright";
    }>>;
    config: z.ZodOptional<z.ZodString>;
    files: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    headed: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    debug: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    reuseReset: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    noSupervisor: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    workers: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
    testList: z.ZodOptional<z.ZodString>;
    passthrough: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type AkE2eInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=e2e.d.ts.map