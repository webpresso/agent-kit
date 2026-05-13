/**
 * Blueprint mutation verbs — advanceTask, promoteBlueprint, finalizeBlueprint
 *
 * All mutations:
 *   1. Edit the canonical _overview.md on disk (atomic tmp+rename)
 *   2. Re-ingest into the structured-store DB via ingestAll
 *
 * Platform-first sync (Tasks 2.6 + 2.7):
 *   When a SyncAdapter is available (credentials present, not disabled), mutations
 *   push a BlueprintPlatformEvent before updating local markdown/SQLite.
 *   Iron rule: AK_BLUEPRINT_PLATFORM_DISABLED=1 skips the adapter entirely — the
 *   markdown-canonical path runs byte-identically to the pre-migration behaviour.
 */
/**
 * Minimal platform sync surface needed by CLI mutation handlers.
 *
 * The production factory creates a BlueprintSyncClient + ReplicaManager pair.
 * Tests inject a mock via `_setSyncAdapterForCli`.
 *
 * Intentionally mirrors the SyncAdapter in blueprint-server.ts to keep the
 * two surfaces in sync without introducing a shared module dependency.
 */
export interface SyncAdapter {
    pushEvent(event: {
        readonly eventId: string;
        readonly repoId: string;
        readonly occurredAt: string;
        readonly type: 'task.status_changed';
        readonly payload: {
            readonly type: 'task.status_changed';
            readonly blueprintSlug: string;
            readonly taskId: string;
            readonly fromStatus: string;
            readonly toStatus: string;
        };
    } | {
        readonly eventId: string;
        readonly repoId: string;
        readonly occurredAt: string;
        readonly type: 'blueprint.status_changed';
        readonly payload: {
            readonly type: 'blueprint.status_changed';
            readonly slug: string;
            readonly fromStatus: string;
            readonly toStatus: string;
        };
    }): Promise<void>;
    ensureFresh(opts?: {
        readonly slug?: string;
    }): Promise<void>;
}
type SyncAdapterFactory = () => SyncAdapter | null;
/**
 * Override the adapter factory — for tests only.
 * Pass `null` to restore the production default.
 *
 * @internal
 */
export declare function _setSyncAdapterForCli(factory: SyncAdapterFactory | null): void;
/**
 * Resolve the sync adapter for the current CLI mutation.
 *
 * Iron rule: returns `null` when `AK_BLUEPRINT_PLATFORM_DISABLED=1` regardless
 * of any injected factory — the caller must skip all platform operations.
 *
 * @param cwd - repo working directory, used to locate the replica DB file.
 */
export declare function resolveSyncAdapterForCli(cwd: string): Promise<SyncAdapter | null>;
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