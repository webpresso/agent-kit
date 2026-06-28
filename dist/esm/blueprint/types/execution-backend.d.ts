import { z } from "zod";
/**
 * Canonical execution backend schema for Blueprint-backed execution.
 *
 * Single source of truth — re-exported by:
 *   - src/blueprint/execution/types.ts
 *   - src/blueprint/core/schema.ts
 */
export declare const executionBackendSchema: z.ZodEnum<{
    "omx-team": "omx-team";
    "omx-pll-interactive": "omx-pll-interactive";
    "claude-subagent": "claude-subagent";
    "codex-exec": "codex-exec";
    "local-worktree": "local-worktree";
}>;
export type BlueprintExecutionBackend = z.infer<typeof executionBackendSchema>;
//# sourceMappingURL=execution-backend.d.ts.map