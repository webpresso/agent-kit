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
import { z } from "zod";
import { openDb } from "#db/connection.js";
import { checkFreshness } from "./freshness.js";
import { makeNextAction } from "./next-action.js";
import { resolveBlueprintProjects, } from "./projects.js";
// ---------------------------------------------------------------------------
// Public types — ReadTarget (F15: distinct from MutationTarget)
// ---------------------------------------------------------------------------
export const READ_TARGET_SCOPES = ["current", "roots", "workspace", "all"];
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
function selectProjects(projects, target) {
    if (target.project_id !== undefined) {
        return projects.filter((p) => p.project_id === target.project_id);
    }
    const scope = target.scope ?? "current";
    if (scope === "all")
        return [...projects];
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
function defaultOpen(project) {
    return openDb(project.db_path);
}
async function runOneProject(project, read, openDbFor) {
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
    let conn = null;
    try {
        conn = openDbFor(project);
        const rows = read({ project, db: conn.db });
        return { project, rows, failure: null };
    }
    catch (err) {
        return {
            project,
            rows: [],
            failure: {
                project_id: project.project_id,
                worktree_path: project.worktree_path,
                next_action: makeNextAction("reingest_project", `Failed to read projection at ${project.db_path}: ${stringifyError(err)}`),
            },
        };
    }
    finally {
        try {
            conn?.close();
        }
        catch {
            // Best-effort close; an already-failed read should not mask itself.
        }
    }
}
function stringifyError(err) {
    if (err instanceof Error)
        return err.message;
    return String(err);
}
function collectDuplicateSlugs(rows) {
    const seen = new Map();
    for (const row of rows) {
        const maybe = row;
        const slug = maybe.slug;
        if (typeof slug !== "string" || slug.length === 0)
            continue;
        seen.set(slug, (seen.get(slug) ?? 0) + 1);
    }
    const dups = [];
    for (const [slug, count] of seen) {
        if (count > 1)
            dups.push(slug);
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
export async function aggregateBlueprintRows(options) {
    // Reject mutation-shaped inputs at the boundary.
    const parsedTarget = readTargetSchema.parse(options.target);
    const projects = await resolveBlueprintProjects(options.resolveOptions ?? {});
    const selected = selectProjects(projects, parsedTarget);
    const openDbFor = options.openDbFor ?? defaultOpen;
    const merged = [];
    const failures = [];
    const visited = [];
    for (const project of selected) {
        visited.push({ project_id: project.project_id, worktree_path: project.worktree_path });
        const outcome = await runOneProject(project, options.read, openDbFor);
        if (outcome.failure !== null) {
            failures.push(outcome.failure);
            continue;
        }
        for (const row of outcome.rows) {
            merged.push({ ...row, project_id: project.project_id });
        }
    }
    return {
        rows: merged,
        duplicate_slugs: collectDuplicateSlugs(merged),
        failures,
        projects: visited,
    };
}
//# sourceMappingURL=aggregate.js.map