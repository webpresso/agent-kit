/**
 * `wp_typecheck` MCP tool.
 *
 * Runs the normal scope typecheck at cwd, or resolves exact package targets /
 * source-file targets to their owning scope(s) and runs each scope once.
 * `files` never means isolated-file `tsc`; it is a scope selector only.
 */
import { z } from "zod";
import type { ToolDescriptor } from "#mcp/auto-discover";
declare const inputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    packages: z.ZodOptional<z.ZodArray<z.ZodString>>;
    files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    full: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
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