import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'
import { glob } from 'glob'

import { parseBlueprintForDb } from './parser/blueprint-db-parser.js'
import { parseTechDebtForDb } from './parser/tech-debt-db-parser.js'
import { resolvesCrossRepo } from '#cross-repo/resolver.js'
import { resolveBlueprintRoot } from '#utils/blueprint-root.js'
import { resolveTechDebtRoot } from '#utils/tech-debt-root.js'
import type { RunnerEvent } from '#runners/types'

export interface IngestOptions {
  readonly db: Database.Database
  readonly cwd: string
  readonly dryRun?: boolean
}

export interface IngestResult {
  readonly blueprintsIngested: number
  readonly techDebtIngested: number
  readonly durationMs: number
  readonly errors: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveSlugFromBlueprintPath(filePath: string): string {
  // blueprints/<status>/<slug>/_overview.md  →  slug is the grandparent dir name
  return path.basename(path.dirname(filePath))
}

function deriveSlugFromTechDebtPath(filePath: string): string {
  // tech-debt/<status>/h-NNN-slug.md  →  slug is the basename without extension
  return path.basename(filePath, '.md')
}

function existingBlueprintHash(
  db: Database.Database,
  slug: string,
): string | null {
  const row = db
    .prepare<[string], { content_hash: string }>(
      'SELECT content_hash FROM blueprints WHERE slug = ?',
    )
    .get(slug)
  return row?.content_hash ?? null
}

function existingTechDebtHash(
  db: Database.Database,
  slug: string,
): string | null {
  const row = db
    .prepare<[string], { content_hash: string }>(
      'SELECT content_hash FROM tech_debt_items WHERE slug = ?',
    )
    .get(slug)
  return row?.content_hash ?? null
}

// ---------------------------------------------------------------------------
// Cross-org redaction logic
// ---------------------------------------------------------------------------

/**
 * Returns true when the cross-org dependency should be allowed (not redacted).
 * Delegates to `resolvesCrossRepo` which enforces the both-sides allowlist rule.
 */
function isAllowedCrossOrg(
  db: Database.Database,
  sourceOrg: string,
  targetOrg: string,
): boolean {
  const rows = db
    .prepare<[], { source_org: string; permitted_org: string }>(
      'SELECT source_org, permitted_org FROM correlate_allowlist',
    )
    .all()
  return resolvesCrossRepo(sourceOrg, targetOrg, rows)
}

// ---------------------------------------------------------------------------
// Blueprint ingester
// ---------------------------------------------------------------------------

function upsertBlueprint(db: Database.Database, filePath: string, _cwd: string): void {
  const content = readFileSync(filePath, 'utf8')
  const slug = deriveSlugFromBlueprintPath(filePath)
  const parsed = parseBlueprintForDb(content, filePath, slug)

  const now = Date.now()

  const upsertBp = db.prepare<
    [
      string, string, string, string | null, string | null, string | null,
      string | null, string | null, number | null, string | null,
      string, number, string, number, string, string,
    ]
  >(
    `INSERT INTO blueprints
       (slug, title, status, complexity, owner, created, last_updated, completed_at,
        progress_pct, progress_text, file_path, byte_size, content_hash, ingested_at,
        organization, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title        = excluded.title,
       status       = excluded.status,
       complexity   = excluded.complexity,
       owner        = excluded.owner,
       created      = excluded.created,
       last_updated = excluded.last_updated,
       completed_at = excluded.completed_at,
       progress_pct = excluded.progress_pct,
       progress_text = excluded.progress_text,
       file_path    = excluded.file_path,
       byte_size    = excluded.byte_size,
       content_hash = excluded.content_hash,
       ingested_at  = excluded.ingested_at,
       organization = excluded.organization,
       visibility   = excluded.visibility`,
  )

  const deleteRelated = (table: string, col: string): void => {
    db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(slug)
  }

  const insertTag = db.prepare<[string]>('INSERT OR IGNORE INTO tags (slug) VALUES (?)')
  const insertBlueprintTag = db.prepare<[string, string]>(
    'INSERT OR IGNORE INTO blueprint_tags (blueprint_slug, tag_slug) VALUES (?, ?)',
  )
  const insertDep = db.prepare<[string, string, number]>(
    `INSERT OR IGNORE INTO blueprint_dependencies
       (blueprint_slug, depends_on_slug, is_resolved) VALUES (?, ?, ?)`,
  )
  const insertCrossRepoDep = db.prepare<
    [string, string, string | null, string | null, string | null, number, number]
  >(
    `INSERT OR REPLACE INTO cross_repo_dependencies
       (blueprint_slug, target_repo, target_slug, target_slug_hash, resolved_status,
        is_cross_org, is_redacted)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertTask = db.prepare<
    [string, string, string | null, string, string, string | null, string | null, string | null, number | null]
  >(
    `INSERT INTO tasks
       (blueprint_slug, task_id, wave, title, status, description,
        steps_tdd, acceptance_json, byte_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertTaskDep = db.prepare<[number, number]>(
    'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)',
  )
  const insertTaskFile = db.prepare<[number, string, string]>(
    'INSERT INTO task_files (task_id, file_path, op) VALUES (?, ?, ?)',
  )
  const insertRisk = db.prepare<[string, string, string, string, string]>(
    `INSERT INTO risks (blueprint_slug, risk_id, severity, description, mitigation)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const insertEdge = db.prepare<[string, string, string, string, string]>(
    `INSERT INTO edge_cases (blueprint_slug, edge_id, severity, description, mitigation)
     VALUES (?, ?, ?, ?, ?)`,
  )

  db.transaction(() => {
    upsertBp.run(
      parsed.slug,
      parsed.title,
      parsed.status,
      parsed.complexity,
      parsed.owner,
      parsed.created,
      parsed.lastUpdated,
      parsed.completedAt,
      null,         // progress_pct
      null,         // progress_text
      parsed.filePath,
      parsed.byteSize,
      parsed.contentHash,
      now,
      parsed.organization,
      parsed.visibility,
    )

    // Clear and reinsert all related data
    deleteRelated('blueprint_tags', 'blueprint_slug')
    deleteRelated('blueprint_dependencies', 'blueprint_slug')
    deleteRelated('cross_repo_dependencies', 'blueprint_slug')
    deleteRelated('tasks', 'blueprint_slug')
    deleteRelated('risks', 'blueprint_slug')
    deleteRelated('edge_cases', 'blueprint_slug')

    for (const tag of parsed.tags) {
      insertTag.run(tag)
      insertBlueprintTag.run(slug, tag)
    }

    for (const depSlug of parsed.dependsOn) {
      insertDep.run(slug, depSlug, 0)
    }

    for (const crossDep of parsed.crossRepoDependsOn) {
      const targetOrg = crossDep.repo.split('/')[0] ?? 'unknown'
      const isCrossOrg = targetOrg !== parsed.organization ? 1 : 0
      const shouldRedact =
        isCrossOrg === 1 && !isAllowedCrossOrg(db, parsed.organization, targetOrg)

      let targetSlug: string | null = crossDep.slug
      let targetSlugHash: string | null = null

      if (shouldRedact && crossDep.slug !== null) {
        targetSlugHash = createHash('sha256').update(crossDep.slug).digest('hex')
        targetSlug = null
      }

      insertCrossRepoDep.run(
        slug,
        crossDep.repo,
        targetSlug,
        targetSlugHash,
        crossDep.requireStatus,
        isCrossOrg,
        shouldRedact ? 1 : 0,
      )
    }

    // Build a task_id → DB row id map for dependency resolution
    const taskDbIdMap = new Map<string, number>()

    for (const task of parsed.tasks) {
      const info = insertTask.run(
        slug,
        task.taskId,
        task.wave,
        task.title,
        task.status,
        task.description,
        null,  // steps_tdd
        task.acceptanceCriteria.length > 0
          ? JSON.stringify(task.acceptanceCriteria)
          : null,
        null,  // byte_size
      )
      const rowId = Number(info.lastInsertRowid)
      taskDbIdMap.set(task.taskId, rowId)

      for (const f of task.files) {
        insertTaskFile.run(rowId, f.filePath, f.op)
      }
    }

    // Insert task dependencies now that all tasks are stored
    for (const task of parsed.tasks) {
      const taskRowId = taskDbIdMap.get(task.taskId)
      if (taskRowId === undefined) continue
      for (const depId of task.dependsOnTaskIds) {
        const depRowId = taskDbIdMap.get(depId)
        if (depRowId === undefined) continue
        insertTaskDep.run(taskRowId, depRowId)
      }
    }

    for (const risk of parsed.risks) {
      insertRisk.run(slug, risk.riskId, risk.severity, risk.description, risk.mitigation)
    }

    for (const edge of parsed.edgeCases) {
      insertEdge.run(slug, edge.edgeId, edge.severity, edge.description, edge.mitigation)
    }
  })()
}

function upsertTechDebt(db: Database.Database, filePath: string, _cwd: string): void {
  const content = readFileSync(filePath, 'utf8')
  const slug = deriveSlugFromTechDebtPath(filePath)
  const parsed = parseTechDebtForDb(content, filePath, slug)

  const upsertItem = db.prepare<
    [
      string, string, string, string, string, string | null, string | null,
      string | null, number | null, string, number | null, string | null,
      string, string,
    ]
  >(
    `INSERT INTO tech_debt_items
       (slug, status, severity, category, review_cadence, last_reviewed, created,
        next_review, base_priority, file_path, byte_size, content_hash,
        organization, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       status         = excluded.status,
       severity       = excluded.severity,
       category       = excluded.category,
       review_cadence = excluded.review_cadence,
       last_reviewed  = excluded.last_reviewed,
       created        = excluded.created,
       next_review    = excluded.next_review,
       base_priority  = excluded.base_priority,
       file_path      = excluded.file_path,
       byte_size      = excluded.byte_size,
       content_hash   = excluded.content_hash,
       organization   = excluded.organization,
       visibility     = excluded.visibility`,
  )

  const deleteLinked = db.prepare<[string]>(
    'DELETE FROM tech_debt_linked_blueprints WHERE techdebt_slug = ?',
  )
  const insertLinked = db.prepare<[string, string]>(
    'INSERT OR IGNORE INTO tech_debt_linked_blueprints (techdebt_slug, blueprint_slug) VALUES (?, ?)',
  )

  db.transaction(() => {
    upsertItem.run(
      parsed.slug,
      parsed.status,
      parsed.severity,
      parsed.category,
      parsed.reviewCadence,
      parsed.lastReviewed,
      parsed.created,
      parsed.nextReview,
      parsed.basePriority,
      parsed.filePath,
      parsed.byteSize,
      parsed.contentHash,
      parsed.organization,
      parsed.visibility,
    )

    deleteLinked.run(slug)
    for (const bp of parsed.linkedBlueprints) {
      insertLinked.run(slug, bp)
    }
  })()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function ingestBlueprints(opts: IngestOptions): Promise<IngestResult> {
  const { db, cwd, dryRun = false } = opts
  const start = Date.now()
  const errors: string[] = []
  let ingested = 0

  const blueprintRoot = resolveBlueprintRoot(cwd)
  const pattern = path.join(blueprintRoot, '**', '_overview.md').replace(/\\/g, '/')
  const files = await glob(pattern, { absolute: true, nodir: true })

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf8')
      const slug = deriveSlugFromBlueprintPath(filePath)
      const newHash = createHash('sha256').update(content).digest('hex')

      if (!dryRun) {
        const existing = existingBlueprintHash(db, slug)
        if (existing === newHash) continue
        upsertBlueprint(db, filePath, cwd)
      }
      ingested++
    } catch (err) {
      const msg = `[ingester] Blueprint failed: ${filePath}: ${String(err)}`
      process.stderr.write(msg + '\n')
      errors.push(msg)
    }
  }

  return {
    blueprintsIngested: ingested,
    techDebtIngested: 0,
    durationMs: Date.now() - start,
    errors,
  }
}

export async function ingestTechDebt(opts: IngestOptions): Promise<IngestResult> {
  const { db, cwd, dryRun = false } = opts
  const start = Date.now()
  const errors: string[] = []
  let ingested = 0

  const techDebtRoot = resolveTechDebtRoot(cwd)
  const pattern = path.join(techDebtRoot, '**', 'h-*.md').replace(/\\/g, '/')
  const files = await glob(pattern, { absolute: true, nodir: true })

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf8')
      const slug = deriveSlugFromTechDebtPath(filePath)
      const newHash = createHash('sha256').update(content).digest('hex')

      if (!dryRun) {
        const existing = existingTechDebtHash(db, slug)
        if (existing === newHash) continue
        upsertTechDebt(db, filePath, cwd)
      }
      ingested++
    } catch (err) {
      const msg = `[ingester] TechDebt failed: ${filePath}: ${String(err)}`
      process.stderr.write(msg + '\n')
      errors.push(msg)
    }
  }

  return {
    blueprintsIngested: 0,
    techDebtIngested: ingested,
    durationMs: Date.now() - start,
    errors,
  }
}

export async function ingestAll(opts: IngestOptions): Promise<IngestResult> {
  const start = Date.now()
  const [bp, td] = await Promise.all([ingestBlueprints(opts), ingestTechDebt(opts)])
  return {
    blueprintsIngested: bp.blueprintsIngested,
    techDebtIngested: td.techDebtIngested,
    durationMs: Date.now() - start,
    errors: [...bp.errors, ...td.errors],
  }
}

// ---------------------------------------------------------------------------
// Runner event ingester
// ---------------------------------------------------------------------------

export interface IngestRunnerEventInput {
  readonly db: Database.Database
  readonly executionHandle: string
  readonly sequence: number
  readonly event: RunnerEvent
  readonly runnerVersion: string
}

export function ingestRunnerEvent(input: IngestRunnerEventInput): void {
  const { db, executionHandle, sequence, event, runnerVersion } = input

  if (runnerVersion === '') {
    throw new Error('runnerVersion must not be empty')
  }

  let message: string | null = null
  let exitCode: number | null = null
  let filePath: string | null = null

  switch (event.type) {
    case 'progress':
      message = event.message
      break
    case 'stdout':
    case 'stderr':
      message = event.line
      break
    case 'completed':
      exitCode = event.exitCode
      break
    case 'failed':
      exitCode = 0
      message = event.error
      break
    case 'artifact':
      filePath = event.path
      break
    case 'started':
    case 'cancelled':
      // no extra columns
      break
  }

  db.prepare<[string, number, string, string, string | null, number | null, string | null]>(
    `INSERT INTO runner_events
       (execution_handle, sequence, kind, ts, message, exit_code, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(executionHandle, sequence, event.type, event.ts, message, exitCode, filePath)
}
