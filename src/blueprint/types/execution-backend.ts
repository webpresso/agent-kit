import { z } from 'zod'

/**
 * Canonical execution backend schema for Blueprint-backed execution.
 *
 * Single source of truth — re-exported by:
 *   - src/blueprint/execution/types.ts (as executionBackendSchema + blueprintExecutionBackendSchema alias)
 *   - src/blueprint/core/schema.ts
 */
export const executionBackendSchema = z.enum([
  'omx-team',
  'omx-pll-interactive',
  'claude-subagent',
  'codex-exec',
  'local-worktree',
])
export type BlueprintExecutionBackend = z.infer<typeof executionBackendSchema>
