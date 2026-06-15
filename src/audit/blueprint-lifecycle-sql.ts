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

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  getLegalLifecycleTargets,
  isLegalLifecycleTransition,
  parseLifecycleBlueprintStatus,
} from '#lifecycle/transition-matrix.js'
import { buildEphemeralProjection } from '#db/ephemeral-projection.js'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'
import { loadBudgets } from './_budgets.js'

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

/** A task is "terminal" (counts as finished) when it is done OR intentionally dropped. */
const TERMINAL_TASK_SQL = "('done','dropped')"
const STALENESS_SCOPE = new Set(['in-progress'])
const STALENESS_WARNING_PREFIX = '[warn]'

function isGitHistoryAvailable(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 1_500,
    })
    return true
  } catch {
    return false
  }
}

function readLastGitTouchIso(cwd: string, filePath: string): string | null {
  try {
    const repoRelativePath = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', repoRelativePath], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 1_500,
    }).trim()
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

function ageInDays(isoTimestamp: string, nowMs: number): number | null {
  const touchedAtMs = Date.parse(isoTimestamp)
  if (Number.isNaN(touchedAtMs)) return null
  return Math.floor((nowMs - touchedAtMs) / 86_400_000)
}

function readFrontmatterStatus(markdown: string): string | null {
  const frontmatterBody = readFrontmatterBody(markdown)
  if (!frontmatterBody) return null
  const statusMatch = frontmatterBody.match(/^status:\s*(.+)$/m)
  if (!statusMatch?.[1]) return null
  return statusMatch[1].trim().replace(/^['"]|['"]$/g, '')
}

function readFrontmatterBody(markdown: string): string | null {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/m)
  return frontmatterMatch?.[1] ?? null
}

function hasHistoricalVerificationGapWaiver(markdown: string): boolean {
  const frontmatterBody = readFrontmatterBody(markdown)
  if (!frontmatterBody) return false
  return /^historical_verification_gap_waiver:\s*true\s*$/m.test(frontmatterBody)
}

function hasHistoricalZeroTaskWaiver(markdown: string): boolean {
  const frontmatterBody = readFrontmatterBody(markdown)
  if (!frontmatterBody) return false
  return (
    /^historical_zero_task_waiver:\s*true\s*$/m.test(frontmatterBody) &&
    /^historical_zero_task_rationale:\s*\S.+$/m.test(frontmatterBody)
  )
}

interface GitHistoryEntry {
  readonly revision: string
  readonly filePath: string
}

function listBlueprintHistoryEntries(cwd: string, filePath: string): GitHistoryEntry[] {
  try {
    const repoRelativePath = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath
    let trackedPath = repoRelativePath.replace(/\\/g, '/')
    const out = execFileSync(
      'git',
      ['log', '--follow', '--format=commit:%H', '--name-status', '--', trackedPath],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 1_500,
        maxBuffer: 1024 * 1024,
      },
    )

    const history: GitHistoryEntry[] = []
    let currentRevision: string | null = null
    let currentPathAtRevision: string | null = null
    let nextTrackedPath = trackedPath

    const flushEntry = (): void => {
      if (!currentRevision || !currentPathAtRevision) return
      history.push({ revision: currentRevision, filePath: currentPathAtRevision })
      trackedPath = nextTrackedPath
    }

    for (const rawLine of out.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      if (line.startsWith('commit:')) {
        flushEntry()
        currentRevision = line.slice('commit:'.length).trim()
        currentPathAtRevision = trackedPath
        nextTrackedPath = trackedPath
        continue
      }

      const parts = line.split('\t')
      const status = parts[0]?.trim() ?? ''
      if (!status.startsWith('R')) continue

      const oldPath = parts[1]?.trim().replace(/\\/g, '/')
      const newPath = parts[2]?.trim().replace(/\\/g, '/')
      if (oldPath && newPath && newPath === currentPathAtRevision) {
        nextTrackedPath = oldPath
      }
    }

    flushEntry()
    return history
  } catch {
    return []
  }
}

function readHistoricalFile(cwd: string, revision: string, filePath: string): string | null {
  try {
    return execFileSync('git', ['show', `${revision}:${filePath}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 1_500,
      maxBuffer: 1024 * 1024,
    })
  } catch {
    return null
  }
}

function readPreviousLifecycleStatusFromGit(
  cwd: string,
  filePath: string,
  currentStatus: string,
): string | null {
  const history = listBlueprintHistoryEntries(cwd, filePath)
  if (history.length < 2) return null

  for (const entry of history.slice(1)) {
    const markdown = readHistoricalFile(cwd, entry.revision, entry.filePath)
    if (!markdown) continue
    const status = readFrontmatterStatus(markdown)
    if (!status || status === currentStatus) continue
    return status
  }

  return null
}

export interface BlueprintLifecycleAuditOptions {
  /** Opt-in: also audit `.omx/plans/` derived-handoff governance (`--legacy-omx`). */
  readonly includeOmxPlans?: boolean
}

export async function auditBlueprintLifecycleSql(
  cwd: string = process.cwd(),
  options: BlueprintLifecycleAuditOptions = {},
): Promise<RepoAuditResult> {
  const budgets = loadBudgets(cwd)
  const wipInProgressMax = budgets['blueprint-wip-in-progress-max'].max ?? 3
  const staleInProgressDays = budgets['blueprint-stale-in-progress-days'].max_days ?? 14

  // Structural markdown checks (type / status-vs-folder / _overview / linking /
  // optional .omx-plan handoff governance). Run unconditionally and merged —
  // this is NOT a fallback. Dynamic import keeps the heavy guardrails module off
  // the hook-runtime hot path until the audit runs.
  const { auditBlueprintLifecycle } = await import('./repo-guardrails.js')
  const structural = auditBlueprintLifecycle(cwd, options)

  const violations: RepoAuditViolation[] = [...structural.violations]
  const advisoryViolations: RepoAuditViolation[] = []
  let checked = structural.checked
  const titleNotices: string[] = []

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
      const hasNonTerminalTask = db
        .prepare<[string], { open_tasks: number }>(
          `SELECT COUNT(*) AS open_tasks
             FROM tasks
            WHERE blueprint_slug = ?
              AND status NOT IN ${TERMINAL_TASK_SQL}`,
        )
        .get(row.slug)
      if ((hasNonTerminalTask?.open_tasks ?? 0) === 0) continue
      violations.push({
        file: row.file_path,
        message: `Blueprint '${row.slug}' is marked completed but progress_pct is ${row.progress_pct}% (expected 100)`,
      })
    }

    // -----------------------------------------------------------------------
    // 5. in-progress blueprints whose tasks are ALL terminal (done|dropped)
    //    — finished work left in the in-progress lane. terminal = done ∪ dropped
    //    so a de-scoped task doesn't keep a finished blueprint pinned forever.
    // -----------------------------------------------------------------------
    const allTerminalInProgress = db
      .prepare<[], { slug: string; file_path: string; total: number }>(
        `SELECT b.slug, b.file_path, COUNT(t.id) AS total
         FROM blueprints b
         JOIN tasks t ON t.blueprint_slug = b.slug
         WHERE b.status = 'in-progress'
         GROUP BY b.slug, b.file_path
         HAVING COUNT(t.id) > 0
            AND SUM(CASE WHEN t.status IN ${TERMINAL_TASK_SQL} THEN 1 ELSE 0 END) = COUNT(t.id)`,
      )
      .all()

    checked += allTerminalInProgress.length
    for (const row of allTerminalInProgress) {
      violations.push({
        file: row.file_path,
        message: `Blueprint '${row.slug}' has all ${row.total} tasks done/dropped but is still in 'in-progress/' — move it to completed/ or reopen a task`,
      })
    }

    // -----------------------------------------------------------------------
    // 6. completed blueprints with a non-terminal task (status untruthful)
    // -----------------------------------------------------------------------
    const completedWithOpenTasks = db
      .prepare<[], { slug: string; file_path: string }>(
        `SELECT b.slug, b.file_path
         FROM blueprints b
         WHERE b.status = 'completed'
           AND EXISTS (
             SELECT 1 FROM tasks t
             WHERE t.blueprint_slug = b.slug
               AND t.status NOT IN ${TERMINAL_TASK_SQL}
           )`,
      )
      .all()

    checked += completedWithOpenTasks.length
    for (const row of completedWithOpenTasks) {
      violations.push({
        file: row.file_path,
        message: `Blueprint '${row.slug}' is marked completed but has tasks that are not done/dropped`,
      })
    }

    // -----------------------------------------------------------------------
    // 7. WIP limit — at most the configured max blueprints in the in-progress lane
    // -----------------------------------------------------------------------
    const inProgressCountRows = db
      .prepare<[], { n: number }>(
        `SELECT COUNT(*) AS n FROM blueprints WHERE status = 'in-progress'`,
      )
      .all()
    const inProgressCount = inProgressCountRows[0]?.n ?? 0
    checked += 1
    if (inProgressCount > wipInProgressMax) {
      violations.push({
        message: `${inProgressCount} blueprints are in-progress — the lane limit is ${wipInProgressMax} (budget: blueprint-wip-in-progress-max); finish or park some before starting more`,
      })
    }

    // -----------------------------------------------------------------------
    // 8. Staleness — warn (do not fail) when an in-progress blueprint has not
    //    been touched in git within the configured day budget.
    // -----------------------------------------------------------------------
    const staleCandidates = allBlueprints.filter((row) => STALENESS_SCOPE.has(row.status))
    checked += staleCandidates.length
    if (staleCandidates.length > 0) {
      if (isGitHistoryAvailable(cwd)) {
        const nowMs = Date.now()
        for (const row of staleCandidates) {
          const lastTouchIso = readLastGitTouchIso(cwd, row.file_path)
          if (lastTouchIso === null) continue
          const ageDays = ageInDays(lastTouchIso, nowMs)
          if (ageDays === null || ageDays <= staleInProgressDays) continue
          advisoryViolations.push({
            file: row.file_path,
            message:
              `${STALENESS_WARNING_PREFIX} Blueprint '${row.slug}' is stale: last git touch was ` +
              `${lastTouchIso.slice(0, 10)} (${ageDays} days ago), exceeding ` +
              `blueprint-stale-in-progress-days=${staleInProgressDays}`,
          })
        }
      } else {
        titleNotices.push('staleness check skipped outside git')
      }
    }

    // -----------------------------------------------------------------------
    // 9. Transition legality — best effort, based on previous lifecycle status
    //    observed in git history. Missing history fails open by design.
    // -----------------------------------------------------------------------
    checked += allBlueprints.length
    if (allBlueprints.length === 0) {
      // Nothing to reconcile against history, so suppress the outside-git notice.
    } else if (isGitHistoryAvailable(cwd)) {
      for (const row of allBlueprints) {
        const currentMarkdown = readFileSync(row.file_path, 'utf8')
        if (hasHistoricalVerificationGapWaiver(currentMarkdown)) continue

        const currentStatus = parseLifecycleBlueprintStatus(row.status)
        if (!currentStatus) continue
        const previousRaw = readPreviousLifecycleStatusFromGit(cwd, row.file_path, currentStatus)
        if (!previousRaw) continue
        const previousStatus = parseLifecycleBlueprintStatus(previousRaw)
        if (!previousStatus) continue
        if (isLegalLifecycleTransition(previousStatus, currentStatus)) {
          if (
            previousStatus === 'planned' &&
            currentStatus === 'completed' &&
            !hasHistoricalZeroTaskWaiver(currentMarkdown)
          ) {
            const taskCount = db
              .prepare<[string], { total: number }>(
                `SELECT COUNT(*) AS total FROM tasks WHERE blueprint_slug = ?`,
              )
              .get(row.slug)?.total ?? 0
            if (taskCount === 0) {
              violations.push({
                file: row.file_path,
                message: `Blueprint '${row.slug}' moved directly from planned to completed with 0 tasks — add tasks or an explicit historical zero-task waiver and rationale`,
              })
            }
          }
          continue
        }

        violations.push({
          file: row.file_path,
          message:
            `Blueprint '${row.slug}' moved from '${previousStatus}' to '${currentStatus}', which is illegal; ` +
            `legal targets from '${previousStatus}' are: ${getLegalLifecycleTargets(previousStatus).join(', ') || '(none)'}`,
        })
      }
    } else {
      titleNotices.push('transition history check skipped outside git')
    }

    const title =
      titleNotices.length === 0
        ? 'Blueprint lifecycle'
        : `Blueprint lifecycle — ${titleNotices.join('; ')}`

    return {
      ok: violations.length === 0,
      title,
      checked,
      violations: [...violations, ...advisoryViolations],
    }
  } finally {
    conn.close()
  }
}
