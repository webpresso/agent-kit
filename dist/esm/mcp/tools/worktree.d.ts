/**
 * `wp_worktree` MCP tool.
 *
 * Stateful, execute-gated worktree lifecycle operations for agent-kit managed
 * git worktrees. Read actions are safe by default; mutating actions require an
 * explicit `{ execute: true }` contract and return structured failure before
 * side effects when safety checks fail.
 */
import { z } from "zod";
import type { ToolDescriptor } from "#mcp/auto-discover";
declare const inputSchema: z.ZodObject<{
    cwd: z.ZodOptional<z.ZodString>;
    action: z.ZodEnum<{
        remove: "remove";
        root: "root";
        list: "list";
        new: "new";
        refresh: "refresh";
        prune: "prune";
    }>;
    name: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    baseRef: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
    execute: z.ZodOptional<z.ZodBoolean>;
    force: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type WpWorktreeInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=worktree.d.ts.map