/**
 * Blueprint mutation verbs — advanceTask, promoteBlueprint, finalizeBlueprint
 *
 * All mutations:
 *   1. Edit the canonical _overview.md on disk (atomic tmp+rename)
 *   2. Re-ingest into the structured-store DB via ingestAll
 */
declare const ALL_STATES: readonly ["draft", "planned", "in-progress", "parked", "archived", "completed"];
type BlueprintState = (typeof ALL_STATES)[number];
declare const TASK_STATUSES: readonly ["todo", "in-progress", "blocked", "done", "dropped"];
type TaskStatus = (typeof TASK_STATUSES)[number];
export interface AdvanceTaskResult {
    readonly blueprintSlug: string;
    readonly taskId: string;
    readonly oldStatus: string;
    readonly newStatus: TaskStatus;
    readonly message: string;
}
export interface PromoteBlueprintResult {
    readonly slug: string;
    readonly oldState: string;
    readonly newState: BlueprintState;
    readonly newPath: string;
    readonly message: string;
}
/**
 * Advance a task's status in its blueprint's _overview.md, then re-ingest.
 *
 * Atomic: writes to a temp file then renames onto the original.
 * Idempotent: if the task is already at `toStatus`, reports "already <toStatus>" and exits cleanly.
 */
export declare function advanceTask(cwd: string, blueprintSlug: string, taskId: string, toStatus: TaskStatus): Promise<AdvanceTaskResult>;
/**
 * Promote a blueprint to a new lifecycle state.
 *
 * - Updates `status:` in frontmatter
 * - If toState === 'completed': also sets `completed_at:` and verifies all tasks are `done`/`dropped`
 * - Moves directory to `blueprints/<toState>/<slug>/` atomically via renameSync
 * - Re-ingests into DB
 */
export declare function promoteBlueprint(cwd: string, slug: string, toState: 'planned' | 'in-progress' | 'completed' | 'parked'): Promise<PromoteBlueprintResult>;
/**
 * Finalize a blueprint — alias for `promoteBlueprint(cwd, slug, 'completed')`.
 * Validates all tasks are done/dropped before moving.
 */
export declare function finalizeBlueprint(cwd: string, slug: string): Promise<PromoteBlueprintResult>;
export {};
//# sourceMappingURL=mutations.d.ts.map