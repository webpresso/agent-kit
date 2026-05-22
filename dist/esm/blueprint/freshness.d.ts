/**
 * HEAD-pinned projection freshness (F11 / E11 / R9).
 *
 * The blueprint markdown directory is git-tracked. A `git checkout other-branch`
 * flips on-disk files without touching the SQLite projection, so cached MCP
 * reads can silently return rows for the wrong commit. This module pins HEAD
 * at ingest time and refuses cached reads when HEAD has moved.
 *
 * Storage: a JSON sidecar at `<dbPath>.meta.json`. The sidecar is intentionally
 * decoupled from the SQLite schema so this task does not touch migrations or
 * collide with Task 1.1's path policy. The sidecar is rebuilt by the ingester
 * and may be safely deleted — `checkFreshness` will return
 * `next_action: 'reingest_project'`.
 *
 * Non-goals here:
 *   - No long-lived cache. Each call re-reads the sidecar and re-runs
 *     `git rev-parse HEAD`.
 *   - No watcher / no background invalidation.
 *   - No platform-canonical sync.
 *
 * Consumers: `assembleBlueprintContext` (this task) and Task 2.2's MCP
 * handlers (`wp_blueprint_list`, `_get`, `_context`).
 */
import { type NextAction } from './next-action.js';
/**
 * The minimal `BlueprintProjectRef` slice this module needs. Task 1.2 owns
 * the full `BlueprintProjectRef`; we depend only on the fields that drive
 * freshness so the helper stays usable without the full resolver.
 */
export interface BlueprintProjectLike {
    readonly worktree_path: string;
    readonly db_path: string;
}
export interface ProjectionMetadata {
    /**
     * `git rev-parse HEAD` captured at ingest time, or `null` when the worktree
     * was not a git repo.
     */
    readonly head_at_ingest: string | null;
    /** Epoch milliseconds at which the projection was last written. */
    readonly ingested_at: number;
}
export type FreshnessResult = {
    readonly ok: true;
    readonly head: string | null;
    readonly ingestedAt: number;
} | {
    readonly ok: false;
    readonly next_action: NextAction;
};
export interface RecordProjectionMetadataInput {
    readonly dbPath: string;
    readonly cwd: string;
    readonly ingestedAt: number;
}
/** Read the sidecar metadata for a projection DB. Returns null on miss/parse-failure. */
export declare function readProjectionMetadata(dbPath: string): ProjectionMetadata | null;
/**
 * Write the sidecar metadata. Caller (the ingester) supplies the cwd that was
 * just ingested so we capture the right HEAD.
 */
export declare function recordProjectionMetadata(input: RecordProjectionMetadataInput): ProjectionMetadata;
/**
 * Decide whether the projection DB is fresh for the given worktree.
 *
 * Order of checks:
 *   1. DB file missing → `rebuild_db`.
 *   2. Sidecar missing → `reingest_project`.
 *   3. HEAD recorded ≠ HEAD now → `reingest_project`.
 *   4. Otherwise fresh.
 *
 * `null === null` is treated as fresh: a non-git worktree had no HEAD at
 * ingest and still has none.
 */
export declare function checkFreshness(project: BlueprintProjectLike): FreshnessResult;
//# sourceMappingURL=freshness.d.ts.map