import { randomUUID } from "node:crypto";

import { resolveScratchWorktreePath } from "#worktrees/location.js";

/**
 * Generates an agent-kit managed scratch worktree path for the given task.
 *
 * Local worktree runners are non-owner sandboxes, so they live under the hidden
 * `.scratch/` lane for the task/blueprint identifier instead of creating a
 * visible sibling checkout.
 */
export function generateWorktreePath(repoRoot: string, taskId: string): string {
  return resolveScratchWorktreePath(repoRoot, taskId, "local-worktree", randomUUID());
}
