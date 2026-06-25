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

import { openDb } from "#db/connection.js";
import { checkFreshness } from "./freshness.js";
import { makeNextAction, type NextAction } from "./next-action.js";
import {
  type BlueprintProjectRef,
  resolveBlueprintProjects,
  type ResolveBlueprintProjectsOptions,
} from "./projects.js";

// ---------------------------------------------------------------------------
// Public types — ReadTarget (F15: distinct from MutationTarget)
// ---------------------------------------------------------------------------

export const READ_TARGET_SCOPES = ["current", "roots", "workspace", "all"] as const;

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
export const readTargetSchema = z
  .object({
    project_id: z.string().min(1).optional(),
    scope: z.enum(READ_TARGET_SCOPES).optional(),
  })
  .strict();

export type ReadTarget = z.infer<typeof readTargetSchema>;

// ---------------------------------------------------------------------------
// Public types — aggregate result shape
// ---------------------------------------------------------------------------

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
export type TaggedRow<TRow> = TRow & { readonly project_id: string };

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

// ---------------------------------------------------------------------------
// Reader callback — caller-supplied per-project read
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internals — scope filter
// ---------------------------------------------------------------------------

/**
 * Apply the read-target filter to the resolved project list.
 *
 * - `project_id` is the highest-precedence filter; when present, exactly one
 *   project is selected (or zero if no match).
 * - `scope` selects a band: `'current'` keeps only the current project (the
 *   first in source order is the current project per Task 1.2 priority);
 *   `'roots'` keeps MCP-root projects; `'workspace'` keeps workspace-config
 *   and git-worktree projects; `'all'` keeps everything resolved.
 * - When neither is set, the safe default is `'current'`.
 */
function selectProjects(
  projects: ReadonlyArray<BlueprintProjectRef>,
  target: ReadTarget,
): BlueprintProjectRef[] {
  if (target.project_id !== undefined) {
    return projects.filter((p) => p.project_id === target.project_id);
  }

  const scope = target.scope ?? "current";
  if (scope === "all") return [...projects];

  if (scope === "current") {
    const current = projects.find((p) => p.source === "current");
    return current ? [current] : projects.length > 0 && projects[0] ? [projects[0]] : [];
  }

  if (scope === "roots") {
    return projects.filter((p) => p.source === "mcp_roots");
  }

  // scope === 'workspace'
  return projects.filter((p) => p.source === "workspace_config" || p.source === "git_worktree");
}

// ---------------------------------------------------------------------------
// Internals — per-project read with failure isolation
// ---------------------------------------------------------------------------

function defaultOpen(project: BlueprintProjectRef): {
  readonly db: Database;
  readonly close: () => void;
} {
  return openDb(project.db_path);
}

interface PerProjectOutcome<TRow> {
  readonly project: BlueprintProjectRef;
  readonly rows: ReadonlyArray<TRow>;
  readonly failure: AggregateFailure | null;
}

async function runOneProject<TRow>(
  project: BlueprintProjectRef,
  read: ProjectReader<TRow>,
  openDbFor: (project: BlueprintProjectRef) => {
    readonly db: Database;
    readonly close: () => void;
  },
): Promise<PerProjectOutcome<TRow>> {
  // Freshness gate (Task 1.3 / F11) — refuse stale or missing projections with
  // a structured hint. Read-only aggregate calls must not auto-rebuild DBs:
  // callers need an explicit per-project failure they can surface or repair.
  const fresh = checkFreshness({
    worktree_path: project.worktree_path,
    db_path: project.db_path,
  });
  if (!fresh.ok) {
    return {
      project,
      rows: [],
      failure: {
        project_id: project.project_id,
        worktree_path: project.worktree_path,
        next_action: fresh.next_action,
      },
    };
  }

  let conn: { readonly db: Database; readonly close: () => void } | null = null;
  try {
    conn = openDbFor(project);
    const rows = read({ project, db: conn.db });
    return { project, rows, failure: null };
  } catch (err) {
    return {
      project,
      rows: [],
      failure: {
        project_id: project.project_id,
        worktree_path: project.worktree_path,
        next_action: makeNextAction(
          "reingest_project",
          `Failed to read projection at ${project.db_path}: ${stringifyError(err)}`,
        ),
      },
    };
  } finally {
    try {
      conn?.close();
    } catch {
      // Best-effort close; an already-failed read should not mask itself.
    }
  }
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Internals — duplicate-slug detection
// ---------------------------------------------------------------------------

interface MaybeSlugged {
  readonly slug?: unknown;
}

function collectDuplicateSlugs<TRow>(rows: ReadonlyArray<TaggedRow<TRow>>): string[] {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const maybe = row as unknown as MaybeSlugged;
    const slug = maybe.slug;
    if (typeof slug !== "string" || slug.length === 0) continue;
    seen.set(slug, (seen.get(slug) ?? 0) + 1);
  }
  const dups: string[] = [];
  for (const [slug, count] of seen) {
    if (count > 1) dups.push(slug);
  }
  dups.sort();
  return dups;
}

// ---------------------------------------------------------------------------
// Public API — the one aggregate primitive
// ---------------------------------------------------------------------------

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
export async function aggregateBlueprintRows<TRow extends Record<string, unknown>>(
  options: AggregateBlueprintRowsOptions<TRow>,
): Promise<AggregateResult<TRow>> {
  // Reject mutation-shaped inputs at the boundary.
  const parsedTarget = readTargetSchema.parse(options.target);

  const projects = await resolveBlueprintProjects(options.resolveOptions ?? {});
  const selected = selectProjects(projects, parsedTarget);

  const openDbFor = options.openDbFor ?? defaultOpen;

  const merged: TaggedRow<TRow>[] = [];
  const failures: AggregateFailure[] = [];
  const visited: Array<{ project_id: string; worktree_path: string }> = [];

  for (const project of selected) {
    visited.push({ project_id: project.project_id, worktree_path: project.worktree_path });
    const outcome = await runOneProject(project, options.read, openDbFor);
    if (outcome.failure !== null) {
      failures.push(outcome.failure);
      continue;
    }
    for (const row of outcome.rows) {
      merged.push({ ...row, project_id: project.project_id } as TaggedRow<TRow>);
    }
  }

  return {
    rows: merged,
    duplicate_slugs: collectDuplicateSlugs(merged),
    failures,
    projects: visited,
  };
}
