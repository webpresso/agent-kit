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
 * Consumers: Task 2.2's `wp_blueprint_context` MCP tool. The helper is
 * deliberately CLI-free so it can be imported by MCP without dragging
 * `src/cli` into the dependency graph.
 */

import type { Database } from '#db/sqlite.js'

import { checkFreshness, type BlueprintProjectLike } from './freshness.js'
import { makeNextAction, type NextAction } from './next-action.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ContextScope = 'summary' | 'next-task' | 'task' | 'verification'

export type ContextChunkKind =
  | 'overview'
  | 'task-rollup'
  | 'next-task'
  | 'no-task'
  | 'task'
  | 'task-dep'
  | 'verification'

export interface ContextChunk {
  readonly chunk_id: string
  readonly kind: ContextChunkKind
  readonly heading: string
  readonly text: string
  readonly source_path: string
  readonly content_hash: string
  readonly ingested_at: number
  readonly head_at_ingest: string | null
}

export interface AssembleContextInput {
  readonly db: Database
  readonly slug: string
  readonly scope: ContextScope
  readonly task_id?: string
  /**
   * Project reference used for HEAD-pin freshness lookup. The `worktree_path`
   * supplies the current `git rev-parse HEAD`; the `db_path` locates the
   * metadata sidecar that records `head_at_ingest`. Callers obtain this via
   * Task 1.2's `resolveBlueprintProject` resolver.
   */
  readonly project: BlueprintProjectLike
}

export type ContextResult =
  | {
      readonly ok: true
      readonly value: {
        readonly project_slug: string
        readonly scope: ContextScope
        readonly chunks: readonly ContextChunk[]
        readonly head_at_ingest: string | null
        readonly ingested_at: number
      }
    }
  | { readonly ok: false; readonly next_action: NextAction }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-chunk text byte cap; keeps MCP responses bounded. */
export const CONTEXT_CHUNK_MAX_BYTES = 4_096

/** Hard cap on the number of dependency-cone tasks returned in `scope=task`. */
export const TASK_DEP_CONE_LIMIT = 32

/** Hard cap on completed-task chunks for `scope=verification`. */
export const VERIFICATION_RECENT_LIMIT = 10

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface BlueprintRow {
  slug: string
  title: string
  status: string
  complexity: string | null
  owner: string | null
  last_updated: string | null
  completed_at: string | null
  file_path: string
  content_hash: string
  ingested_at: number
}

interface TaskRow {
  id: number
  blueprint_slug: string
  task_id: string
  title: string
  status: string
  wave: string | null
  description: string | null
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function loadBlueprint(db: Database, slug: string): BlueprintRow | null {
  const row = db
    .prepare<[string], BlueprintRow>(
      `SELECT slug, title, status, complexity, owner, last_updated, completed_at,
              file_path, content_hash, ingested_at
       FROM blueprints
       WHERE slug = ?`,
    )
    .get(slug)
  return row ?? null
}

function loadTasks(db: Database, slug: string): readonly TaskRow[] {
  return db
    .prepare<[string], TaskRow>(
      `SELECT id, blueprint_slug, task_id, title, status, wave, description
       FROM tasks
       WHERE blueprint_slug = ?
       ORDER BY task_id ASC`,
    )
    .all(slug)
}

function loadTaskById(db: Database, slug: string, taskId: string): TaskRow | null {
  const row = db
    .prepare<[string, string], TaskRow>(
      `SELECT id, blueprint_slug, task_id, title, status, wave, description
       FROM tasks
       WHERE blueprint_slug = ? AND task_id = ?`,
    )
    .get(slug, taskId)
  return row ?? null
}

function loadDirectDeps(db: Database, taskRowId: number): readonly TaskRow[] {
  return db
    .prepare<[number], TaskRow>(
      `SELECT t.id, t.blueprint_slug, t.task_id, t.title, t.status, t.wave, t.description
       FROM task_dependencies td
       JOIN tasks t ON t.id = td.depends_on_task_id
       WHERE td.task_id = ?
       ORDER BY t.task_id ASC`,
    )
    .all(taskRowId)
}

/**
 * Walk the dependency cone breadth-first, capped at `TASK_DEP_CONE_LIMIT`.
 * Returns deps sorted by `task_id` ascending for deterministic output.
 */
function loadDepCone(db: Database, rootTaskRowId: number): readonly TaskRow[] {
  const seen = new Set<number>([rootTaskRowId])
  const result: TaskRow[] = []
  const queue: number[] = [rootTaskRowId]

  while (queue.length > 0 && result.length < TASK_DEP_CONE_LIMIT) {
    const cur = queue.shift() as number
    const direct = loadDirectDeps(db, cur)
    for (const dep of direct) {
      if (seen.has(dep.id)) continue
      seen.add(dep.id)
      result.push(dep)
      queue.push(dep.id)
      if (result.length >= TASK_DEP_CONE_LIMIT) break
    }
  }

  return result.sort((a, b) => a.task_id.localeCompare(b.task_id, 'en', { numeric: true }))
}

// ---------------------------------------------------------------------------
// Chunk shaping
// ---------------------------------------------------------------------------

function clampText(text: string): string {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes <= CONTEXT_CHUNK_MAX_BYTES) return text
  // Walk back from the byte cap to avoid splitting a UTF-8 code point.
  const buf = Buffer.from(text, 'utf8').subarray(0, CONTEXT_CHUNK_MAX_BYTES)
  return buf.toString('utf8')
}

interface ChunkBase {
  readonly bp: BlueprintRow
  readonly headAtIngest: string | null
}

function buildOverviewChunk(base: ChunkBase): ContextChunk {
  const { bp, headAtIngest } = base
  const text = [
    `Title: ${bp.title}`,
    `Status: ${bp.status}`,
    bp.complexity ? `Complexity: ${bp.complexity}` : null,
    bp.owner ? `Owner: ${bp.owner}` : null,
    bp.last_updated ? `Last updated: ${bp.last_updated}` : null,
    bp.completed_at ? `Completed at: ${bp.completed_at}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  return {
    chunk_id: `${bp.slug}:overview`,
    kind: 'overview',
    heading: `Blueprint ${bp.slug}`,
    text: clampText(text),
    source_path: bp.file_path,
    content_hash: bp.content_hash,
    ingested_at: bp.ingested_at,
    head_at_ingest: headAtIngest,
  }
}

function buildTaskRollupChunk(base: ChunkBase, tasks: readonly TaskRow[]): ContextChunk {
  const counts: Record<string, number> = {
    todo: 0,
    'in-progress': 0,
    blocked: 0,
    done: 0,
    dropped: 0,
  }
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1
  }

  const text = [
    `Total tasks: ${tasks.length}`,
    `  todo:        ${counts['todo'] ?? 0}`,
    `  in-progress: ${counts['in-progress'] ?? 0}`,
    `  blocked:     ${counts['blocked'] ?? 0}`,
    `  done:        ${counts['done'] ?? 0}`,
    `  dropped:     ${counts['dropped'] ?? 0}`,
  ].join('\n')

  return {
    chunk_id: `${base.bp.slug}:task-rollup`,
    kind: 'task-rollup',
    heading: `Task rollup for ${base.bp.slug}`,
    text: clampText(text),
    source_path: base.bp.file_path,
    content_hash: base.bp.content_hash,
    ingested_at: base.bp.ingested_at,
    head_at_ingest: base.headAtIngest,
  }
}

function buildTaskChunk(
  base: ChunkBase,
  task: TaskRow,
  kind: 'task' | 'task-dep' | 'next-task' | 'verification',
): ContextChunk {
  const text = [
    `Task ${task.task_id}: ${task.title}`,
    `Status: ${task.status}`,
    task.wave ? `Wave: ${task.wave}` : null,
    task.description ? '' : null,
    task.description ?? null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  return {
    chunk_id: `${base.bp.slug}:task:${task.task_id}:${kind}`,
    kind,
    heading: `Task ${task.task_id}: ${task.title}`,
    text: clampText(text),
    source_path: base.bp.file_path,
    content_hash: base.bp.content_hash,
    ingested_at: base.bp.ingested_at,
    head_at_ingest: base.headAtIngest,
  }
}

// ---------------------------------------------------------------------------
// Scope assemblers
// ---------------------------------------------------------------------------

function assembleSummary(base: ChunkBase, db: Database): ContextChunk[] {
  const tasks = loadTasks(db, base.bp.slug)
  return [buildOverviewChunk(base), buildTaskRollupChunk(base, tasks)]
}

function assembleNextTask(base: ChunkBase, db: Database): ContextChunk[] {
  // First eligible: status=todo AND every dep is done. Order by task_id asc.
  const candidates = db
    .prepare<[string], TaskRow>(
      `SELECT t.id, t.blueprint_slug, t.task_id, t.title, t.status, t.wave, t.description
       FROM tasks t
       WHERE t.blueprint_slug = ?
         AND t.status = 'todo'
         AND NOT EXISTS (
           SELECT 1 FROM task_dependencies td
           JOIN tasks dep ON dep.id = td.depends_on_task_id
           WHERE td.task_id = t.id AND dep.status != 'done'
         )
       ORDER BY t.task_id ASC
       LIMIT 1`,
    )
    .all(base.bp.slug)

  if (candidates.length === 0 || candidates[0] === undefined) {
    return [
      {
        chunk_id: `${base.bp.slug}:no-task`,
        kind: 'no-task',
        heading: `No ready task in ${base.bp.slug}`,
        text: 'No `todo` tasks with all dependencies satisfied.',
        source_path: base.bp.file_path,
        content_hash: base.bp.content_hash,
        ingested_at: base.bp.ingested_at,
        head_at_ingest: base.headAtIngest,
      },
    ]
  }

  return [buildTaskChunk(base, candidates[0], 'next-task')]
}

function assembleTask(base: ChunkBase, db: Database, taskId: string): ContextChunk[] | NextAction {
  const target = loadTaskById(db, base.bp.slug, taskId)
  if (target === null) {
    return makeNextAction('verify_task', `Task ${taskId} not found in blueprint ${base.bp.slug}.`)
  }
  const cone = loadDepCone(db, target.id)
  const chunks: ContextChunk[] = [buildTaskChunk(base, target, 'task')]
  for (const dep of cone) {
    chunks.push(buildTaskChunk(base, dep, 'task-dep'))
  }
  return chunks
}

function assembleVerification(base: ChunkBase, db: Database): ContextChunk[] {
  // Most-recent-completed proxy: highest task_id with status=done. Cap at limit.
  const done = db
    .prepare<[string, number], TaskRow>(
      `SELECT id, blueprint_slug, task_id, title, status, wave, description
       FROM tasks
       WHERE blueprint_slug = ? AND status = 'done'
       ORDER BY task_id DESC
       LIMIT ?`,
    )
    .all(base.bp.slug, VERIFICATION_RECENT_LIMIT)

  return done.map((t) => buildTaskChunk(base, t, 'verification'))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function assembleBlueprintContext(input: AssembleContextInput): ContextResult {
  // 1) Freshness — refuse cached reads when HEAD changed (E11/F11).
  const fresh = checkFreshness(input.project)
  if (!fresh.ok) {
    return { ok: false, next_action: fresh.next_action }
  }
  const headAtIngest = fresh.head
  const ingestedAtFreshness = fresh.ingestedAt

  // 2) Locate the blueprint row.
  const bp = loadBlueprint(input.db, input.slug)
  if (bp === null) {
    return {
      ok: false,
      next_action: makeNextAction(
        'disambiguate_slug',
        `Blueprint "${input.slug}" not found in this projection; check spelling or scope.`,
      ),
    }
  }

  const base: ChunkBase = { bp, headAtIngest }

  // 3) Scope dispatch.
  let chunks: readonly ContextChunk[]
  switch (input.scope) {
    case 'summary':
      chunks = assembleSummary(base, input.db)
      break
    case 'next-task':
      chunks = assembleNextTask(base, input.db)
      break
    case 'task': {
      if (input.task_id === undefined) {
        return {
          ok: false,
          next_action: makeNextAction('verify_task', `scope="task" requires a task_id input.`),
        }
      }
      const taskResult = assembleTask(base, input.db, input.task_id)
      if (!Array.isArray(taskResult)) {
        return { ok: false, next_action: taskResult }
      }
      chunks = taskResult
      break
    }
    case 'verification':
      chunks = assembleVerification(base, input.db)
      break
    default: {
      const _exhaustive: never = input.scope
      throw new Error(`Unknown context scope: ${String(_exhaustive)}`)
    }
  }

  return {
    ok: true,
    value: {
      project_slug: input.slug,
      scope: input.scope,
      chunks,
      head_at_ingest: headAtIngest,
      ingested_at: ingestedAtFreshness,
    },
  }
}
