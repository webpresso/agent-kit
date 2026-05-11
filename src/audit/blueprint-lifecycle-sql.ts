/**
 * `ak audit blueprint-lifecycle-sql` — SQL-backed rewrite of the existing
 * blueprint-lifecycle audit.
 *
 * Alpha gate: only runs SQL queries when AK_USE_SQL_AUDITS=1.
 * Without the flag falls back to the existing regex-based audit.
 *
 * SQL checks (when enabled):
 * 1. Blueprints with status='in-progress' that have 0 tasks (invalid).
 * 2. Blueprints whose `status` column doesn't match the directory segment
 *    derived from `file_path` (e.g. stored in completed/ but status=in-progress).
 * 3. Tasks in state 'in-progress' whose dependencies are not all done.
 * 4. Blueprints with progress_pct < 100 but status='completed'.
 */

import path from 'node:path'
import { existsSync } from 'node:fs'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const DB_PATH = path.join('.agent', '.blueprints.db')

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

export async function auditBlueprintLifecycleSql(cwd: string): Promise<RepoAuditResult> {
  if (!process.env['AK_USE_SQL_AUDITS']) {
    // Fall back to existing regex-based audit
    const { auditBlueprintLifecycle } = await import('./repo-guardrails.js')
    return auditBlueprintLifecycle(cwd)
  }

  const dbFile = path.join(cwd, DB_PATH)
  if (!existsSync(dbFile)) {
    return {
      ok: true,
      title: 'Blueprint lifecycle (SQL)',
      checked: 0,
      violations: [],
    }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbFile, { readonly: true })

  const violations: RepoAuditViolation[] = []
  let checked = 0

  try {
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
    //    Derive the directory segment from the file_path and compare to status.
    //    Blueprint file_path convention: blueprints/<status>/<slug>/_overview.md
    // -----------------------------------------------------------------------
    const allBlueprints = db
      .prepare<[], BlueprintStatusRow>(
        'SELECT slug, status, file_path, progress_pct FROM blueprints',
      )
      .all()

    checked += allBlueprints.length
    for (const row of allBlueprints) {
      // Derive directory status from the path: second segment after 'blueprints/'
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
      title: 'Blueprint lifecycle (SQL)',
      checked,
      violations,
    }
  } finally {
    db.close()
  }
}
