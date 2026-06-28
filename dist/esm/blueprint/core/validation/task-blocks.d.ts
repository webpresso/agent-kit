import { z } from "zod";
export interface TaskBlock {
    taskId: string;
    block: string;
}
/**
 * Zod schema for optional TASK-level frontmatter fields.
 *
 * - `runners`: optional list of execution backend ids; absent/empty means all runners allowed.
 * - `permissions`: access level the task requires; defaults to `'workspace-write'` when absent.
 */
export declare const taskFrontmatterSchema: z.ZodObject<{
    runners: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        "omx-team": "omx-team";
        "omx-pll-interactive": "omx-pll-interactive";
        "claude-subagent": "claude-subagent";
        "codex-exec": "codex-exec";
        "local-worktree": "local-worktree";
    }>>>;
    permissions: z.ZodDefault<z.ZodEnum<{
        read: "read";
        "workspace-write": "workspace-write";
    }>>;
}, z.core.$strip>;
export type TaskFrontmatter = z.infer<typeof taskFrontmatterSchema>;
export declare function parseTaskBlocks(markdown: string): TaskBlock[];
//# sourceMappingURL=task-blocks.d.ts.map