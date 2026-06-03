/**
 * `wp audit blueprint-lifecycle` — the single, deterministic blueprint-lifecycle
 * audit.
 *
 * The verdict is a pure function of `markdown@HEAD`: this builds an EPHEMERAL
 * in-memory SQLite projection from the repo's blueprint markdown
 * (`buildEphemeralProjection`), runs the relational checks against it, and
 * discards it. It also runs the structural markdown checks
 * (`auditBlueprintLifecycle` — type / status-vs-folder / `_overview.md` presence /
 * linking-frontmatter) and merges both result sets. No persistent on-disk
 * projection is read, so the audit can never hit a stale/missing/locked DB and
 * is identical across CLI, the `wp_audit` MCP tool, `wp doctor`, and CI.
 *
 * Relational checks (against the in-memory projection):
 * 1. Blueprints with status='in-progress' that have 0 tasks (invalid).
 * 2. Blueprints whose `status` column doesn't match the directory segment
 *    derived from `file_path`.
 * 3. Tasks in state 'in-progress' whose dependencies are not all done.
 * 4. Blueprints with progress_pct < 100 but status='completed'.
 */

import { buildEphemeralProjection } from '#db/ephemeral-projection.js'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

interface BlueprintStatusRow {
  slug: string
  status: string
  file_path: string
  progress_pct: number | null
}

interface TaskInProgressRow {
  id: number
  task_id: string
  blueprint_slug: string
  status: string
}

export interface BlueprintLifecycleAuditOptions {
  /** Opt-in: also audit `.omx/plans/` derived-handoff governance (`--legacy-omx`). */
  readonly includeOmxPlans?: boolean
}

export async function auditBlueprintLifecycleSql(
  cwd: string = process.cwd(),
  options: BlueprintLifecycleAuditOptions = {},
): Promise<RepoAuditResult> {
  // Structural markdown checks (type / status-vs-folder / _overview / linking /
  // optional .omx-plan handoff governance). Run unconditionally and merged —
  // this is NOT a fallback. Dynamic import keeps the heavy guardrails module off
  // the hook-runtime hot path until the audit runs.
  const { auditBlueprintLifecycle } = await import('./repo-guardrails.js')
  const structural = auditBlueprintLifecycle(cwd, options)

  const violations: RepoAuditViolation[] = [...structural.violations]
  let checked = structural.checked

  const conn = await buildEphemeralProjection(cwd)
  const { db } = conn

  try {
    const allBlueprints = db
      .prepare<[], BlueprintStatusRow>(
        'SELECT slug, status, file_path, progress_pct FROM blueprints',
      )
      .all()

    // -----------------------------------------------------------------------
    // 1. in-progress blueprints with 0 tasks
    // -----------------------------------------------------------------------
    const inProgressNoTasks = db
      .prepare<[], { slug: string; file_path: string }>(
        `SELECT b.slug, b.file_path
         FROM blueprints b
         WHERE b.status = 'in-progress'
           AND NOT EXISTS (
             SELECT 1 FROM tasks t WHERE t.blueprint_slug = b.slug
           )`,
      )
      .all()

    checked += inProgressNoTasks.length
    for (const row of inProgressNoTasks) {
      violations.push({
        file: row.file_path,
        message: `Blueprint '${row.slug}' is in-progress but has 0 tasks — in-progress blueprints must have at least one task`,
      })
    }

    // -----------------------------------------------------------------------
    // 2. status/directory mismatch
    //    Blueprint file_path convention: blueprints/<status>/<slug>/_overview.md
    // -----------------------------------------------------------------------
    checked += allBlueprints.length
    for (const row of allBlueprints) {
      const segments = row.file_path.replace(/\\/g, '/').split('/')
      const blueprintsIdx = segments.lastIndexOf('blueprints')
      const dirStatus = blueprintsIdx >= 0 ? segments[blueprintsIdx + 1] : null

      if (dirStatus !== null && dirStatus !== row.status) {
        violations.push({
          file: row.file_path,
          message: `Blueprint '${row.slug}' has status='${row.status}' but lives in the '${dirStatus}/' directory`,
        })
      }
    }

    // -----------------------------------------------------------------------
    // 3. Tasks in-progress with unsatisfied dependencies
    // -----------------------------------------------------------------------
    const blockedInProgress = db
      .prepare<[], TaskInProgressRow>(
        `SELECT t.id, t.task_id, t.blueprint_slug, t.status
         FROM tasks t
         WHERE t.status = 'in-progress'
           AND EXISTS (
             SELECT 1
             FROM task_dependencies td
             JOIN tasks dep ON dep.id = td.depends_on_task_id
             WHERE td.task_id = t.id
               AND dep.status != 'done'
           )`,
      )
      .all()

    checked += blockedInProgress.length
    for (const row of blockedInProgress) {
      violations.push({
        message: `Task '${row.task_id}' in blueprint '${row.blueprint_slug}' is in-progress but has unmet dependencies`,
      })
    }

    // -----------------------------------------------------------------------
    // 4. Completed blueprints with progress_pct < 100
    // -----------------------------------------------------------------------
    const incompleteCompleted = db
      .prepare<[], { slug: string; file_path: string; progress_pct: number }>(
        `SELECT slug, file_path, progress_pct
         FROM blueprints
         WHERE status = 'completed'
           AND progress_pct IS NOT NULL
           AND progress_pct < 100`,
      )
      .all()

    checked += incompleteCompleted.length
    for (const row of incompleteCompleted) {
      violations.push({
        file: row.file_path,
        message: `Blueprint '${row.slug}' is marked completed but progress_pct is ${row.progress_pct}% (expected 100)`,
      })
    }

    return {
      ok: violations.length === 0,
      title: 'Blueprint lifecycle',
      checked,
      violations,
    }
  } finally {
    conn.close()
  }
}
