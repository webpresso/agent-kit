/**
 * Blueprint context-chunk assembler.
 *
 * Returns the minimum slice of blueprint state an agent needs for a given
 * action: an overview, the next ready task, a specific task with its
 * dependency cone, or a verification-evidence digest of recently-completed
 * work. The helper is a pure projection over the existing SQLite tables
 * created by Task 1.x's ingester — it does not parse markdown again.
 *
 * Freshness (E11/F11): every call first asks `checkFreshness` to compare the
 * worktree HEAD against the HEAD recorded at ingest. A mismatch returns
 * `next_action: 'reingest_project'` instead of stale rows.
 *
 * Determinism: chunks are deterministic for identical `(db rows, cwd HEAD)`
 * input. Text payloads are clamped to `CONTEXT_CHUNK_MAX_BYTES` so the
 * helper cannot recreate markdown context bloat.
 *
 * Consumers: Task 2.2's `ak_blueprint_context` MCP tool. The helper is
 * deliberately CLI-free so it can be imported by MCP without dragging
 * `src/cli` into the dependency graph.
 */
import type { Database } from '#db/sqlite.js';
import { type BlueprintProjectLike } from './freshness.js';
import { type NextAction } from './next-action.js';
export type ContextScope = 'summary' | 'next-task' | 'task' | 'verification';
export type ContextChunkKind = 'overview' | 'task-rollup' | 'next-task' | 'no-task' | 'task' | 'task-dep' | 'verification';
export interface ContextChunk {
    readonly chunk_id: string;
    readonly kind: ContextChunkKind;
    readonly heading: string;
    readonly text: string;
    readonly source_path: string;
    readonly content_hash: string;
    readonly ingested_at: number;
    readonly head_at_ingest: string | null;
}
export interface AssembleContextInput {
    readonly db: Database;
    readonly slug: string;
    readonly scope: ContextScope;
    readonly task_id?: string;
    /**
     * Project reference used for HEAD-pin freshness lookup. The `worktree_path`
     * supplies the current `git rev-parse HEAD`; the `db_path` locates the
     * metadata sidecar that records `head_at_ingest`. Callers obtain this via
     * Task 1.2's `resolveBlueprintProject` resolver.
     */
    readonly project: BlueprintProjectLike;
}
export type ContextResult = {
    readonly ok: true;
    readonly value: {
        readonly project_slug: string;
        readonly scope: ContextScope;
        readonly chunks: readonly ContextChunk[];
        readonly head_at_ingest: string | null;
        readonly ingested_at: number;
    };
} | {
    readonly ok: false;
    readonly next_action: NextAction;
};
/** Per-chunk text byte cap; keeps MCP responses bounded. */
export declare const CONTEXT_CHUNK_MAX_BYTES = 4096;
/** Hard cap on the number of dependency-cone tasks returned in `scope=task`. */
export declare const TASK_DEP_CONE_LIMIT = 32;
/** Hard cap on completed-task chunks for `scope=verification`. */
export declare const VERIFICATION_RECENT_LIMIT = 10;
export declare function assembleBlueprintContext(input: AssembleContextInput): ContextResult;
//# sourceMappingURL=context.d.ts.map