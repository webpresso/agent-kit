/**
 * Read-only aggregate helpers across selected blueprint projects (Task 3.1).
 *
 * Fans out read-only queries to N project projection DBs (resolved by Task 1.2's
 * `resolveBlueprintProjects`), checks freshness (Task 1.3 — `checkFreshness`),
 * tags every row with its source `project_id`, and merges results in memory.
 *
 * Design notes:
 *
 * - **No global projection DB.** Each project owns a worktree-scoped SQLite
 *   file resolved by Task 1.1's `resolveBlueprintProjectionDbPath`. This helper
 *   opens those DBs one at a time and unions the rows in JS — no schema
 *   change, no parallel projection.
 *
 * - **Failure isolation.** A broken/missing/stale DB for one project records a
 *   structured failure entry and continues. The aggregate call never throws
 *   for per-project errors — callers see `ok: true` with `failures` populated.
 *
 * - **Stale projection → `next_action: 'reingest_project'`** (F11/R9). The
 *   offending `project_id` is included in the failure entry; the caller can
 *   re-ingest that one project without disturbing the others.
 *
 * - **Duplicate slugs.** When two projects expose the same blueprint slug,
 *   both rows appear in `rows` (tagged by `project_id`) and the slug is also
 *   listed under `duplicate_slugs`. Callers MUST disambiguate; this helper
 *   refuses to silently pick one.
 *
 * - **F15 — read-only target shape.** `ReadTarget = { project_id?, scope? }`.
 *   It does NOT extend the `MutationTarget` zod base. Including a mutation
 *   field (`worktree_path`, etc.) at parse time is a type error. Mutation
 *   tools must not share this shape.
 */
import type { Database } from "#db/sqlite.js";
import { z } from "zod";
import { type NextAction } from "./next-action.js";
import { type BlueprintProjectRef, type ResolveBlueprintProjectsOptions } from "./projects.js";
export declare const READ_TARGET_SCOPES: readonly ["current", "roots", "workspace", "all"];
export type ReadTargetScope = (typeof READ_TARGET_SCOPES)[number];
/**
 * Input shape for read-only aggregate calls (F15).
 *
 * Read-only paths accept `scope` (per-project fan-out) and/or an explicit
 * `project_id`. They MUST NOT accept a mutation-target field like
 * `worktree_path` — those belong on `MutationTarget` (Task 2.2).
 *
 * `.strict()` rejects unknown keys at zod parse time so callers cannot smuggle
 * a `worktree_path` or similar through this surface.
 */
export declare const readTargetSchema: z.ZodObject<{
    project_id: z.ZodOptional<z.ZodString>;
    scope: z.ZodOptional<z.ZodEnum<{
        all: "all";
        workspace: "workspace";
        current: "current";
        roots: "roots";
    }>>;
}, z.core.$strict>;
export type ReadTarget = z.infer<typeof readTargetSchema>;
/**
 * Per-project failure record. The aggregate call captures one of these
 * instead of throwing when a project DB cannot be read.
 */
export interface AggregateFailure {
    readonly project_id: string;
    readonly worktree_path: string;
    readonly next_action: NextAction;
}
/**
 * Row tagging contract: every row returned from an aggregate call carries the
 * source `project_id`. The reader callback never sees a tagged row; this
 * module decorates after the read completes.
 */
export type TaggedRow<TRow> = TRow & {
    readonly project_id: string;
};
export interface AggregateResult<TRow> {
    readonly rows: ReadonlyArray<TaggedRow<TRow>>;
    /**
     * Slugs that appeared in more than one project's rows. Surfaced so callers
     * can refuse to act on an ambiguous slug. Empty when no row carries a `slug`
     * field or when no duplicates exist.
     */
    readonly duplicate_slugs: ReadonlyArray<string>;
    readonly failures: ReadonlyArray<AggregateFailure>;
    readonly projects: ReadonlyArray<{
        readonly project_id: string;
        readonly worktree_path: string;
    }>;
}
export interface ProjectReaderContext {
    readonly project: BlueprintProjectRef;
    readonly db: Database;
}
/**
 * Caller-supplied read fn. Runs against one already-open DB and returns
 * un-tagged rows. The aggregate helper handles tagging, merging, and
 * disambiguation.
 *
 * MUST be read-only. There is no write transaction or lock acquired here.
 */
export type ProjectReader<TRow> = (ctx: ProjectReaderContext) => ReadonlyArray<TRow>;
export interface AggregateBlueprintRowsOptions<TRow> {
    readonly target: ReadTarget;
    readonly read: ProjectReader<TRow>;
    /**
     * Injectable project resolver options — same surface as Task 1.2. Tests
     * pass `workspaceRepos`, `rootsProvider`, `git`, etc., to avoid spawning
     * real git or touching the filesystem outside a temp dir.
     */
    readonly resolveOptions?: ResolveBlueprintProjectsOptions;
    /**
     * Hook for tests to override how each project's DB is opened. Production
     * code uses the default `openDb` from `#db/connection.js`.
     */
    readonly openDbFor?: (project: BlueprintProjectRef) => {
        readonly db: Database;
        readonly close: () => void;
    };
}
/**
 * Run a read-only reader against every selected project and merge the rows.
 *
 * Behaviour summary (acceptance reference):
 *
 *  - **Tagged rows:** every row in `rows` carries `project_id` of the source
 *    project. The reader callback never sees this field.
 *  - **Failure isolation:** a broken DB, a stale projection, or a reader
 *    exception records a `failures[]` entry and the aggregate call still
 *    returns `ok`. Other projects continue.
 *  - **Stale projection:** returns `next_action: 'reingest_project'` with the
 *    offending `project_id` in `failures[]`. Does NOT throw.
 *  - **Scope:** `'current' | 'roots' | 'workspace' | 'all'` selects which
 *    resolved projects to fan out across. `'current'` is the default when
 *    neither `scope` nor `project_id` is provided.
 *  - **Duplicate slugs:** rows with a string `slug` field are checked; any
 *    slug appearing in more than one project is surfaced in
 *    `duplicate_slugs[]`. Callers MUST refuse to silently pick one.
 *  - **Read-only:** the input schema (`readTargetSchema`) has no mutation
 *    fields; `.strict()` rejects extras at zod parse time.
 *
 * The reader is given an already-open DB and is expected to issue ordinary
 * read queries (e.g. the existing query templates under `src/blueprint/db/`).
 * Connection lifecycle is owned by the aggregate helper.
 */
export declare function aggregateBlueprintRows<TRow extends Record<string, unknown>>(options: AggregateBlueprintRowsOptions<TRow>): Promise<AggregateResult<TRow>>;
//# sourceMappingURL=aggregate.d.ts.map