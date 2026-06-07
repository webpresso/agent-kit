/**
 * Zod schema for implementation plan frontmatter validation.
 *
 * Blueprint owns its own schema contract so the package can export
 * blueprint-specific parsing and validation without reaching into schema-defs.
 */
import { z } from 'zod';
/**
 * Execution backend values for Blueprint-backed execution.
 * Canonical definition lives in src/blueprint/types/execution-backend.ts.
 */
import { executionBackendSchema } from '#types/execution-backend.js';
export { executionBackendSchema } from '#types/execution-backend.js';
/**
 * Valid plan status values.
 * Maps to plan lifecycle: draft/planned/parked → in-progress → completed/archived.
 */
export declare const planStatusSchema: z.ZodEnum<{
    completed: "completed";
    draft: "draft";
    planned: "planned";
    parked: "parked";
    "in-progress": "in-progress";
    archived: "archived";
}>;
/**
 * Canonical blueprint lifecycle statuses for executable blueprints.
 */
export declare const lifecycleBlueprintStatusSchema: z.ZodEnum<{
    completed: "completed";
    draft: "draft";
    planned: "planned";
    parked: "parked";
    "in-progress": "in-progress";
    archived: "archived";
}>;
/**
 * Canonical task statuses for blueprint lifecycle management.
 */
export declare const taskStatusSchema: z.ZodEnum<{
    blocked: "blocked";
    "in-progress": "in-progress";
    todo: "todo";
    done: "done";
    dropped: "dropped";
}>;
/**
 * Valid complexity values using t-shirt sizing.
 */
export declare const complexitySchema: z.ZodEnum<{
    XS: "XS";
    S: "S";
    M: "M";
    L: "L";
    XL: "XL";
}>;
/**
 * Execution status values persisted in Blueprint frontmatter.
 */
export declare const executionStatusSchema: z.ZodEnum<{
    pending: "pending";
    running: "running";
    blocked: "blocked";
    completed: "completed";
    failed: "failed";
    stopped: "stopped";
}>;
export declare const crossRepoDependencySchema: z.ZodObject<{
    repo: z.ZodString;
    slug: z.ZodString;
    require_status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        draft: "draft";
        planned: "planned";
        parked: "parked";
        "in-progress": "in-progress";
        archived: "archived";
    }>>;
}, z.core.$strip>;
/**
 * Plan frontmatter schema.
 *
 * Required fields:
 * - type: `blueprint` or `parent-roadmap`
 * - status: Current plan status
 * - complexity: Estimated effort using t-shirt sizing (defaults to `M` when omitted for legacy blueprints)
 *
 * Optional fields:
 * - last_updated: Date plan was last modified (YYYY-MM-DD)
 * - created: Date plan was created (YYYY-MM-DD)
 * - progress: Human-readable progress string
 * - max_parallel_agents: Maximum parallel agents for execution
 */
export declare const planFrontmatterSchema: z.ZodObject<{
    type: z.ZodEnum<{
        blueprint: "blueprint";
        "parent-roadmap": "parent-roadmap";
    }>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        completed: "completed";
        draft: "draft";
        planned: "planned";
        parked: "parked";
        "in-progress": "in-progress";
        archived: "archived";
    }>;
    complexity: z.ZodDefault<z.ZodEnum<{
        XS: "XS";
        S: "S";
        M: "M";
        L: "L";
        XL: "XL";
    }>>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
    created: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
    progress: z.ZodOptional<z.ZodString>;
    completed_at: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
    execution_backend: z.ZodOptional<z.ZodEnum<{
        "omx-team": "omx-team";
        "omx-pll-interactive": "omx-pll-interactive";
        "claude-subagent": "claude-subagent";
        "codex-exec": "codex-exec";
        "local-worktree": "local-worktree";
    }>>;
    execution_id: z.ZodOptional<z.ZodString>;
    execution_status: z.ZodOptional<z.ZodEnum<{
        pending: "pending";
        running: "running";
        blocked: "blocked";
        completed: "completed";
        failed: "failed";
        stopped: "stopped";
    }>>;
    execution_updated_at: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
    execution_verifications: z.ZodOptional<z.ZodArray<z.ZodString>>;
    execution_artifacts: z.ZodOptional<z.ZodArray<z.ZodString>>;
    execution_log_path: z.ZodOptional<z.ZodString>;
    max_parallel_agents: z.ZodOptional<z.ZodNumber>;
    parent_roadmap: z.ZodOptional<z.ZodString>;
    depends_on: z.ZodOptional<z.ZodArray<z.ZodString>>;
    cross_repo_depends_on: z.ZodOptional<z.ZodArray<z.ZodObject<{
        repo: z.ZodString;
        slug: z.ZodString;
        require_status: z.ZodOptional<z.ZodEnum<{
            completed: "completed";
            draft: "draft";
            planned: "planned";
            parked: "parked";
            "in-progress": "in-progress";
            archived: "archived";
        }>>;
    }, z.core.$strip>>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type PlanFrontmatter = z.infer<typeof planFrontmatterSchema>;
export type BlueprintStatus = z.infer<typeof planStatusSchema>;
export type LifecycleBlueprintStatus = z.infer<typeof lifecycleBlueprintStatusSchema>;
export type PlanComplexity = z.infer<typeof complexitySchema>;
export type BlueprintTaskStatus = z.infer<typeof taskStatusSchema>;
export type BlueprintExecutionBackendValue = z.infer<typeof executionBackendSchema>;
export type BlueprintExecutionStatusValue = z.infer<typeof executionStatusSchema>;
//# sourceMappingURL=schema.d.ts.map