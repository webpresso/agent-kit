/**
 * Blueprint structured-store MCP server — 8 tools for the blueprint DB.
 *
 * Call `registerBlueprintTools(registrar, cwd)` from server startup.
 * It calls `coldStartIfNeeded` once then registers all 8 tools.
 *
 * All outputs honour the summary-first envelope: { summary, failures, bytes, tokensSaved }
 *
 * Platform-first sync (Task 2.1):
 *   When a SyncAdapter is available (credentials present, not disabled), mutations
 *   push a BlueprintPlatformEvent before updating local markdown/SQLite.
 *   Iron rule: AK_BLUEPRINT_PLATFORM_DISABLED=1 skips the adapter entirely — the
 *   markdown-canonical path runs byte-identically to the pre-migration behaviour.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import matter from 'gray-matter'
import { z } from 'zod'

import { coldStartIfNeeded } from '#db/cold-start.js'
import { openDb } from '#db/connection.js'
import { ingestAll } from '#db/ingester.js'
import { findTemplate } from '#db/templates.js'
import { resolveBlueprintRoot } from '#utils/blueprint-root.js'
import { maybeHint } from './_tail-hints.js'
import type { ToolHandlerResult, ToolRegistrar } from './auto-discover.js'

// ---------------------------------------------------------------------------
// Platform-first sync adapter (injectable for tests, Task 2.1)
// ---------------------------------------------------------------------------

/**
 * Minimal platform sync surface needed by blueprint-server handlers.
 *
 * The production factory creates a BlueprintSyncClient + ReplicaManager pair.
 * Tests inject a mock via `_setSyncAdapterFactory`.
 *
 * Keeping this interface here (rather than importing BlueprintPlatformClient
 * directly) avoids coupling blueprint-server to the client implementation and
 * keeps the module testable without live credentials.
 */
export interface SyncAdapter {
  pushEvent(
    event:
      | {
          readonly eventId: string
          readonly repoId: string
          readonly occurredAt: string
          readonly type: 'task.status_changed'
          readonly payload: {
            readonly type: 'task.status_changed'
            readonly blueprintSlug: string
            readonly taskId: string
            readonly fromStatus: string
            readonly toStatus: string
          }
        }
      | {
          readonly eventId: string
          readonly repoId: string
          readonly occurredAt: string
          readonly type: 'blueprint.status_changed'
          readonly payload: {
            readonly type: 'blueprint.status_changed'
            readonly slug: string
            readonly fromStatus: string
            readonly toStatus: string
          }
        }
      | {
          readonly eventId: string
          readonly repoId: string
          readonly occurredAt: string
          readonly type: 'blueprint.finalized'
          readonly payload: {
            readonly type: 'blueprint.finalized'
            readonly slug: string
          }
        }
      | {
          readonly eventId: string
          readonly repoId: string
          readonly occurredAt: string
          readonly type: 'blueprint.created'
          readonly payload: {
            readonly type: 'blueprint.created'
            readonly slug: string
            readonly title: string
            readonly complexity: string
            readonly status: string
          }
        },
  ): Promise<void>
  ensureFresh(opts?: { readonly slug?: string }): Promise<void>
}

type SyncAdapterFactory = () => SyncAdapter | null

/**
 * Module-level factory.  `null` = use the production default (loadSyncCredentials
 * from auth.ts + BlueprintSyncClient + ReplicaManager — lazy-imported so that
 * blueprint-server.ts never statically depends on the HTTP client).
 */
let _syncAdapterFactory: SyncAdapterFactory | null = null

/**
 * Override the adapter factory — for tests only.
 * Pass `null` to restore the production default.
 *
 * @internal
 */
export function _setSyncAdapterFactory(factory: SyncAdapterFactory | null): void {
  _syncAdapterFactory = factory
}

/**
 * Resolve the sync adapter for the current request.
 *
 * Iron rule: returns `null` when `AK_BLUEPRINT_PLATFORM_DISABLED=1` regardless
 * of any injected factory — the caller must skip all platform operations.
 *
 * @param cwd - repo working directory, used to locate the replica DB file.
 */
async function resolveSyncAdapter(cwd: string): Promise<SyncAdapter | null> {
  if (process.env['AK_BLUEPRINT_PLATFORM_DISABLED'] === '1') return null

  if (_syncAdapterFactory !== null) {
    return _syncAdapterFactory()
  }

  // Production default: lazy-import to avoid coupling the module to the HTTP client.
  // #sync/* resolves via the fallback "#*" → "./src/blueprint/*.ts" mapping.
  const [
    { BlueprintSyncClient },
    { loadSyncCredentials },
    { ReplicaManager },
    { openDb: openDbForReplica },
  ] = await Promise.all([
    import('#sync/client.js'),
    import('#sync/auth.js'),
    import('#sync/replica.js'),
    import('#db/connection.js'),
  ])

  const creds = loadSyncCredentials()
  if (creds === null) return null

  const client = new BlueprintSyncClient(creds)

  // ReplicaManager needs a db handle; store the replica DB in the state root.
  const { getSurfacePath, NotInGitRepoError } = await import('#paths/state-root.js')
  const replicaDbPath = (() => {
    try {
      return getSurfacePath('blueprints/replica.db', 'repo', cwd)
    } catch (err) {
      if (err instanceof NotInGitRepoError) return path.join(cwd, '.agent', '.replica.db')
      throw err
    }
  })()
  const conn = openDbForReplica(replicaDbPath)
  const manager = new ReplicaManager({ client, db: conn.db })

  return {
    pushEvent: (event) => client.pushEvent(event),
    ensureFresh: (opts) => manager.ensureFresh(opts),
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_FILENAME = '.blueprints.db'
const VALIDATE_TS_FILE = '.validate-timestamps.json'
const ROWS_CAP = 200
const LIFECYCLE_ADVICE =
  'After creating: /plan-refine to harden; /plan-eng-review to validate; ' +
  'ak_blueprint_promote draft→planned when ready; /pll for parallel execution; ' +
  '/verify before finalize'
const ALL_STATES = ['draft', 'planned', 'in-progress', 'parked', 'archived', 'completed'] as const
const NON_COMPLETED = ['draft', 'planned', 'in-progress', 'parked', 'archived'] as const
const BLUEPRINT_TEMPLATE = `---
type: blueprint
title: "{TITLE}"
status: draft
complexity: {COMPLEXITY}
owner: ""
created: {DATE}
last_updated: {DATE}
---

## Product wedge anchor

- **Stage outcome:** <cite roadmap section + specific outcome>
- **Consuming surface:** <route / component / verb + path>
- **New user-visible capability:** <one sentence>

## Summary

{GOAL}

## Tasks

#### Task 1.1: <task title>

**Status:** todo
**Wave:** 0
**Files:**
- (path)

**Acceptance:**
- [ ] <criterion>
`

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const dbPath = (cwd: string) => path.join(cwd, '.agent', DB_FILENAME)
const vtPath = (cwd: string) => path.join(cwd, '.agent', VALIDATE_TS_FILE)
const bytes = (s: string) => Buffer.byteLength(s, 'utf8')
const toStr = (e: unknown) => (e instanceof Error ? e.message : String(e))

function jsonContent(payload: unknown, isError = false): ToolHandlerResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
    isError,
  }
}

function err(summary: string, error: string): ToolHandlerResult {
  return jsonContent({ summary, failures: [error], bytes: 0, tokensSaved: 0 }, true)
}

function readVt(cwd: string): Record<string, number> {
  try {
    return JSON.parse(readFileSync(vtPath(cwd), 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
}

function writeVt(cwd: string, d: Record<string, number>): void {
  mkdirSync(path.dirname(vtPath(cwd)), { recursive: true })
  writeFileSync(vtPath(cwd), JSON.stringify(d, null, 2), 'utf8')
}

function titleToSlug(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function openDbRW(cwd: string) {
  return openDb(dbPath(cwd))
}

async function reIngest(cwd: string): Promise<void> {
  const target = dbPath(cwd)
  if (!existsSync(target)) return
  const conn = openDb(target)
  try {
    await ingestAll({ db: conn.db, cwd })
  } finally {
    conn.close()
  }
}

function findBlueprintDir(
  blueprintRoot: string,
  slug: string,
  states: readonly string[],
): { dir: string; state: string } | null {
  for (const state of states) {
    const d = path.join(blueprintRoot, state, slug)
    if (existsSync(d)) return { dir: d, state }
  }
  return null
}

function hasRecentAuditFinding(cwd: string): boolean {
  const file = path.join(cwd, '.agent', '.tail-hint-history.jsonl')
  if (!existsSync(file)) return false
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  return readFileSync(file, 'utf8')
    .split('\n')
    .some((l) => {
      try {
        const r = JSON.parse(l) as { hintId?: string; ts?: number }
        return r.hintId === 'AUDIT_FIX' && typeof r.ts === 'number' && r.ts >= cutoff
      } catch {
        return false
      }
    })
}

function appendHint(
  payload: Record<string, unknown>,
  cwd: string,
  hintId: Parameters<typeof maybeHint>[1],
): void {
  const h = maybeHint(cwd, hintId)
  if (h) payload['tail_hint'] = h
}

function finishPayload(payload: Record<string, unknown>): ToolHandlerResult {
  payload['bytes'] = bytes(JSON.stringify(payload))
  return jsonContent(payload)
}

// ---------------------------------------------------------------------------
// Validate logic (shared by handler + promote guard)
// ---------------------------------------------------------------------------

function runValidate(filePath: string): { valid: boolean; gaps: string[] } {
  if (!existsSync(filePath)) return { valid: false, gaps: [`File not found: ${filePath}`] }
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (e) {
    return { valid: false, gaps: [`Cannot read: ${toStr(e)}`] }
  }
  const gaps: string[] = []
  let fm: matter.GrayMatterFile<string>
  try {
    fm = matter(raw)
  } catch (e) {
    return { valid: false, gaps: [`Frontmatter parse error: ${toStr(e)}`] }
  }
  for (const f of ['type', 'title', 'status', 'complexity', 'owner'] as const) {
    const v = (fm.data as Record<string, unknown>)[f]
    if (!v || String(v).trim() === '') gaps.push(`Missing or empty frontmatter field: ${f}`)
  }
  const body = fm.content
  if (!/#### Task\s+\S/.test(body)) gaps.push('No "#### Task" sections found')
  for (const block of body
    .split(/(?=#### Task\s)/)
    .filter((b) => b.trim().startsWith('#### Task'))) {
    const label = /#### Task\s+([\d.]+[:\s]+.+)/.exec(block)?.[1]?.trim() ?? '(unknown)'
    if (!block.includes('**Acceptance:**') && !block.includes('**Acceptance criteria:**'))
      gaps.push(`Task "${label}" is missing **Acceptance:** subsection`)
  }
  if (!/##\s+Product wedge anchor/.test(body))
    gaps.push('Missing "## Product wedge anchor" section')
  return { valid: gaps.length === 0, gaps }
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const querySchema = z.object({
  template_id: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
})
async function handleQuery(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = querySchema.safeParse(raw)
  if (!p.success) return err('ak_blueprint_query validation error', p.error.message)
  const { template_id, params } = p.data
  const tmpl = findTemplate(template_id)
  if (!tmpl)
    return err(`Unknown query template: ${template_id}`, `Template "${template_id}" not found.`)
  try {
    const conn = openDbRW(cwd)
    let rows: unknown[]
    try {
      rows = conn.db.prepare(tmpl.sql).all(...Object.values(params)) as unknown[]
    } finally {
      conn.close()
    }
    const capped = rows.slice(0, ROWS_CAP)
    const text = JSON.stringify(capped)
    const b = bytes(text)
    return jsonContent({
      summary: `Query "${template_id}" returned ${rows.length} rows (cap ${ROWS_CAP})`,
      rows_capped: capped.length,
      rows: capped,
      failures: [],
      bytes: b,
      tokensSaved: Math.max(0, b - bytes(JSON.stringify(rows))),
    })
  } catch (e) {
    return err(`Query "${template_id}" failed`, toStr(e))
  }
}

const newSchema = z.object({
  title: z.string(),
  complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']).default('M'),
  goal_prompt: z.string(),
  examples_count: z.number().int().min(0).max(5).default(3),
})
async function handleNew(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = newSchema.safeParse(raw)
  if (!p.success) return err('ak_blueprint_new validation error', p.error.message)
  const { title, complexity, goal_prompt, examples_count } = p.data
  const today = new Date().toISOString().split('T')[0] ?? ''
  const template = BLUEPRINT_TEMPLATE.replace(/{TITLE}/g, title)
    .replace(/{COMPLEXITY}/g, complexity)
    .replace(/{DATE}/g, today)
    .replace('{GOAL}', goal_prompt)
  const rulesFile = path.join(cwd, '.agent', 'rules', 'blueprint-scoping.md')
  const rulesContext = existsSync(rulesFile) ? readFileSync(rulesFile, 'utf8') : null
  const examples: Array<{ slug: string; title: string; complexity: string }> = []
  const target = dbPath(cwd)
  if (existsSync(target)) {
    try {
      const conn = openDb(target)
      try {
        examples.push(
          ...(conn.db
            .prepare<[string, number], { slug: string; title: string; complexity: string }>(
              `SELECT slug, title, complexity FROM blueprints WHERE status = 'completed' AND complexity = ? ORDER BY ingested_at DESC LIMIT ?`,
            )
            .all(complexity, examples_count) as Array<{
            slug: string
            title: string
            complexity: string
          }>),
        )
      } finally {
        conn.close()
      }
    } catch {
      /* non-fatal */
    }
  }
  const b = bytes(template)
  const slug = titleToSlug(title)
  const targetPath = path.join(resolveBlueprintRoot(cwd), 'draft', slug, '_overview.md')

  // Platform-first path: push event to register the blueprint before returning the scaffold.
  // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(cwd)
  if (adapter !== null) {
    await adapter.pushEvent({
      eventId: randomUUID(),
      repoId: process.env['AK_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
      occurredAt: new Date().toISOString(),
      type: 'blueprint.created',
      payload: {
        type: 'blueprint.created',
        slug,
        title,
        complexity,
        status: 'draft',
      },
    })
  }

  return jsonContent({
    summary: `Blueprint bundle for "${title}" (complexity ${complexity})`,
    target_path: targetPath,
    template,
    rules_context: rulesContext,
    examples,
    lifecycle_advice: LIFECYCLE_ADVICE,
    validation_required: true,
    failures: [],
    bytes: b,
    tokensSaved: 0,
  })
}

const validateSchema = z.object({ path: z.string() })
async function handleValidate(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = validateSchema.safeParse(raw)
  if (!p.success) return err('ak_blueprint_validate validation error', p.error.message)
  const { path: filePath } = p.data
  const result = runValidate(filePath)
  if (result.valid) {
    const ts = readVt(cwd)
    ts[path.basename(path.dirname(filePath))] = Date.now()
    writeVt(cwd, ts)
  }
  const b = bytes(JSON.stringify(result))
  return jsonContent({
    summary: result.valid
      ? `Blueprint at ${filePath} is valid`
      : `Blueprint at ${filePath} has ${result.gaps.length} gap(s)`,
    valid: result.valid,
    gaps: result.gaps,
    failures: result.gaps,
    bytes: b,
    tokensSaved: 0,
  })
}

const taskNextSchema = z.object({ blueprint: z.string().optional() })
async function handleTaskNext(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = taskNextSchema.safeParse(raw)
  if (!p.success) return err('ak_blueprint_task_next validation error', p.error.message)
  const { blueprint } = p.data

  // Platform-first: refresh local replica before reading so the result reflects remote state.
  // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(cwd)
  if (adapter !== null) {
    await adapter.ensureFresh(blueprint !== undefined ? { slug: blueprint } : undefined)
  }

  const target = dbPath(cwd)
  if (!existsSync(target))
    return jsonContent({
      summary: 'No blueprint DB found',
      task: null,
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    })
  try {
    const conn = openDb(target)
    interface TaskRow {
      id: number
      blueprint_slug: string
      task_id: string
      wave: string | null
      lane: string | null
      title: string
      status: string
    }
    const sc = blueprint ? 'AND t.blueprint_slug = ?' : ''
    const readySql = `SELECT t.id, t.blueprint_slug, t.task_id, t.wave, t.lane, t.title, t.status FROM tasks t WHERE t.status = 'todo' ${sc} AND NOT EXISTS (SELECT 1 FROM task_dependencies td JOIN tasks dep ON dep.id = td.depends_on_task_id WHERE td.task_id = t.id AND dep.status != 'done') ORDER BY t.wave, t.id LIMIT 1`
    const w0Sql = `SELECT COUNT(*) as cnt FROM tasks t WHERE t.status = 'todo' AND t.wave = '0' ${sc} AND NOT EXISTS (SELECT 1 FROM task_dependencies td JOIN tasks dep ON dep.id = td.depends_on_task_id WHERE td.task_id = t.id AND dep.status != 'done')`
    let task: TaskRow | null
    let w0cnt: number
    let files: Array<{ file_path: string; op: string }>
    try {
      const args = blueprint ? [blueprint] : []
      task =
        (
          (blueprint
            ? conn.db.prepare(readySql).all(blueprint)
            : conn.db.prepare(readySql).all()) as unknown as TaskRow[]
        )[0] ?? null
      w0cnt =
        (
          (blueprint
            ? conn.db.prepare(w0Sql).all(blueprint)
            : conn.db.prepare(w0Sql).all()) as Array<{ cnt: number }>
        )[0]?.cnt ?? 0
      files = task
        ? (conn.db
            .prepare<[number], { file_path: string; op: string }>(
              'SELECT file_path, op FROM task_files WHERE task_id = ?',
            )
            .all(task.id) as Array<{ file_path: string; op: string }>)
        : []
      void args
    } finally {
      conn.close()
    }
    const payload: Record<string, unknown> = {
      summary: task ? `Next ready task: ${task.task_id} — ${task.title}` : 'No ready tasks found',
      task: task
        ? {
            id: task.id,
            lane: task.lane,
            title: task.title,
            files,
            deps_satisfied: true,
            blueprint_slug: task.blueprint_slug,
            task_id: task.task_id,
            wave: task.wave,
          }
        : null,
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    }
    if (w0cnt >= 3) appendHint(payload, cwd, 'PLL_PARALLEL')
    return finishPayload(payload)
  } catch (e) {
    return err('ak_blueprint_task_next failed', toStr(e))
  }
}

const advanceSchema = z.object({
  task_id: z.string(),
  to: z.enum(['todo', 'in-progress', 'blocked', 'done', 'dropped']),
})
async function handleTaskAdvance(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = advanceSchema.safeParse(raw)
  if (!p.success) return err('ak_blueprint_task_advance validation error', p.error.message)
  const { task_id, to } = p.data
  const target = dbPath(cwd)
  if (!existsSync(target)) return err('ak_blueprint_task_advance failed', 'Blueprint DB not found')
  try {
    const conn = openDb(target)
    let oldStatus: string | null = null
    let filePath: string | null = null
    let blueprintSlug: string | null = null
    try {
      const row = conn.db
        .prepare<[string], { status: string; blueprint_slug: string }>(
          'SELECT status, blueprint_slug FROM tasks WHERE task_id = ? LIMIT 1',
        )
        .get(task_id) as { status: string; blueprint_slug: string } | undefined
      if (!row) return err('ak_blueprint_task_advance failed', `Task "${task_id}" not found in DB`)
      oldStatus = row.status
      blueprintSlug = row.blueprint_slug
      const bp = conn.db
        .prepare<[string], { file_path: string }>('SELECT file_path FROM blueprints WHERE slug = ?')
        .get(row.blueprint_slug) as { file_path: string } | undefined
      if (bp?.file_path) filePath = bp.file_path
    } finally {
      conn.close()
    }

    // Platform-first path: push event + pull fresh replica before local update.
    // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
    const adapter = await resolveSyncAdapter(cwd)
    if (adapter !== null && blueprintSlug !== null && oldStatus !== null) {
      await adapter.pushEvent({
        eventId: randomUUID(),
        repoId: process.env['AK_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
        occurredAt: new Date().toISOString(),
        type: 'task.status_changed',
        payload: {
          type: 'task.status_changed',
          blueprintSlug,
          taskId: task_id,
          fromStatus: oldStatus,
          toStatus: to,
        },
      })
      await adapter.ensureFresh({ slug: blueprintSlug })
    }

    // Always update local markdown + SQLite.
    // Platform-first: these become derived artifacts; disabled: these are canonical.
    if (filePath && existsSync(filePath)) {
      const lines = readFileSync(filePath, 'utf8').split('\n')
      let inBlock = false
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? ''
        if (line.match(new RegExp(`#### Task\\s+${task_id.replace(/\./g, '\\.')}`))) inBlock = true
        else if (inBlock && line.startsWith('#### ')) break
        else if (inBlock && line.startsWith('**Status:**')) {
          lines[i] = `**Status:** ${to}`
          break
        }
      }
      writeFileSync(filePath, lines.join('\n'), 'utf8')
    }
    try {
      await reIngest(cwd)
    } catch {
      /* non-fatal */
    }
    const payload: Record<string, unknown> = {
      summary: `Task "${task_id}" advanced from "${oldStatus}" to "${to}"`,
      task_id,
      old_status: oldStatus,
      new_status: to,
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    }
    if (to === 'done') appendHint(payload, cwd, 'VERIFY_DONE')
    return finishPayload(payload)
  } catch (e) {
    return err('ak_blueprint_task_advance failed', toStr(e))
  }
}

const promoteSchema = z.object({
  slug: z.string(),
  to_state: z.enum(['planned', 'in-progress', 'completed', 'parked', 'archived']),
})
async function handlePromote(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = promoteSchema.safeParse(raw)
  if (!p.success) return err('ak_blueprint_promote validation error', p.error.message)
  const { slug, to_state } = p.data
  const root = resolveBlueprintRoot(cwd)
  const found = findBlueprintDir(root, slug, ALL_STATES)
  if (!found)
    return err(
      'ak_blueprint_promote failed',
      `Blueprint "${slug}" not found in any state directory`,
    )
  const { dir: currentDir, state: currentState } = found
  const overviewPath = path.join(currentDir, '_overview.md')
  const ts = readVt(cwd)
  const mtime = existsSync(overviewPath) ? statSync(overviewPath).mtimeMs : 0
  if ((ts[slug] ?? 0) < mtime)
    return err(
      'ak_blueprint_promote refused',
      `Blueprint "${slug}" not validated since last write. Run ak_blueprint_validate first.`,
    )
  // Platform-first path: push event + pull fresh replica before local move.
  // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(cwd)
  if (adapter !== null) {
    await adapter.pushEvent({
      eventId: randomUUID(),
      repoId: process.env['AK_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
      occurredAt: new Date().toISOString(),
      type: 'blueprint.status_changed',
      payload: {
        type: 'blueprint.status_changed',
        slug,
        fromStatus: currentState,
        toStatus: to_state,
      },
    })
    await adapter.ensureFresh({ slug })
  }

  const { renameSync } = await import('node:fs')
  const destDir = path.join(root, to_state, slug)
  mkdirSync(path.dirname(destDir), { recursive: true })
  try {
    renameSync(currentDir, destDir)
  } catch (e) {
    return err('ak_blueprint_promote failed', `Directory move error: ${toStr(e)}`)
  }
  const destOverview = path.join(destDir, '_overview.md')
  if (existsSync(destOverview)) {
    const fm = matter(readFileSync(destOverview, 'utf8'))
    fm.data['status'] = to_state
    writeFileSync(destOverview, matter.stringify(fm.content, fm.data), 'utf8')
  }
  try {
    await reIngest(cwd)
  } catch {
    /* non-fatal */
  }
  const payload: Record<string, unknown> = {
    summary: `Blueprint "${slug}" promoted from "${currentState}" to "${to_state}"`,
    slug,
    from_state: currentState,
    to_state,
    new_path: destOverview,
    failures: [],
    bytes: 0,
    tokensSaved: 0,
  }
  if (currentState === 'draft' && to_state === 'planned') appendHint(payload, cwd, 'PLAN_REFINE')
  return finishPayload(payload)
}

const finalizeSchema = z.object({ slug: z.string() })
async function handleFinalize(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = finalizeSchema.safeParse(raw)
  if (!p.success) return err('ak_blueprint_finalize validation error', p.error.message)
  const { slug } = p.data
  const target = dbPath(cwd)
  if (!existsSync(target)) return err('ak_blueprint_finalize failed', 'Blueprint DB not found')
  const conn = openDb(target)
  let openTasks: Array<{ task_id: string; status: string }>
  try {
    openTasks = conn.db
      .prepare<[string], { task_id: string; status: string }>(
        `SELECT task_id, status FROM tasks WHERE blueprint_slug = ? AND status NOT IN ('done', 'dropped')`,
      )
      .all(slug) as Array<{ task_id: string; status: string }>
  } finally {
    conn.close()
  }
  if (openTasks.length > 0)
    return err(
      'ak_blueprint_finalize refused',
      `Blueprint "${slug}" has open tasks: ${openTasks.map((t) => `${t.task_id} (${t.status})`).join(', ')}`,
    )
  const root = resolveBlueprintRoot(cwd)
  const found = findBlueprintDir(root, slug, NON_COMPLETED)
  if (!found) {
    const alreadyDone = path.join(root, 'completed', slug)
    if (existsSync(alreadyDone))
      return jsonContent({
        summary: `Blueprint "${slug}" is already in completed`,
        slug,
        failures: [],
        bytes: 0,
        tokensSaved: 0,
      })
    return err('ak_blueprint_finalize failed', `Blueprint "${slug}" not found`)
  }

  // Platform-first path: push event + pull fresh replica before local move.
  // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(cwd)
  if (adapter !== null) {
    await adapter.pushEvent({
      eventId: randomUUID(),
      repoId: process.env['AK_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
      occurredAt: new Date().toISOString(),
      type: 'blueprint.finalized',
      payload: {
        type: 'blueprint.finalized',
        slug,
      },
    })
    await adapter.ensureFresh({ slug })
  }

  const { renameSync } = await import('node:fs')
  const destDir = path.join(root, 'completed', slug)
  mkdirSync(path.dirname(destDir), { recursive: true })
  try {
    renameSync(found.dir, destDir)
  } catch (e) {
    return err('ak_blueprint_finalize failed', `Directory move error: ${toStr(e)}`)
  }
  const destOverview = path.join(destDir, '_overview.md')
  if (existsSync(destOverview)) {
    const fm = matter(readFileSync(destOverview, 'utf8'))
    fm.data['status'] = 'completed'
    fm.data['completed_at'] = new Date().toISOString().split('T')[0] ?? ''
    writeFileSync(destOverview, matter.stringify(fm.content, fm.data), 'utf8')
  }
  try {
    await reIngest(cwd)
  } catch {
    /* non-fatal */
  }
  const payload: Record<string, unknown> = {
    summary: `Blueprint "${slug}" finalized and moved to completed`,
    slug,
    new_path: destOverview,
    failures: [],
    bytes: 0,
    tokensSaved: 0,
  }
  if (hasRecentAuditFinding(cwd)) appendHint(payload, cwd, 'AUDIT_FIX')
  return finishPayload(payload)
}

const depgraphSchema = z.object({ from: z.string() })
async function handleDepgraph(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = depgraphSchema.safeParse(raw)
  if (!p.success) return err('ak_blueprint_depgraph validation error', p.error.message)
  const { from } = p.data
  const target = dbPath(cwd)
  if (!existsSync(target)) return err('ak_blueprint_depgraph failed', 'Blueprint DB not found')
  try {
    const conn = openDb(target)
    const nodes = new Map<string, { slug: string; title: string; status: string }>()
    const edges: Array<{ from: string; to: string; type: string; redacted?: boolean }> = []
    try {
      const queue = [from]
      const visited = new Set<string>()
      while (queue.length > 0) {
        const slug = queue.shift()
        if (!slug || visited.has(slug)) continue
        visited.add(slug)
        const bp = conn.db
          .prepare<[string], { slug: string; title: string; status: string }>(
            'SELECT slug, title, status FROM blueprints WHERE slug = ?',
          )
          .get(slug) as { slug: string; title: string; status: string } | undefined
        if (bp) nodes.set(slug, bp)
        type DR = { depends_on_slug: string }
        for (const d of conn.db
          .prepare<[string], DR>(
            'SELECT depends_on_slug FROM blueprint_dependencies WHERE blueprint_slug = ?',
          )
          .all(slug) as DR[]) {
          edges.push({ from: slug, to: d.depends_on_slug, type: 'blueprint' })
          if (!visited.has(d.depends_on_slug)) queue.push(d.depends_on_slug)
        }
        type CR = {
          target_repo: string
          target_slug: string | null
          target_slug_hash: string | null
          is_redacted: number
        }
        for (const cd of conn.db
          .prepare<[string], CR>(
            'SELECT target_repo, target_slug, target_slug_hash, is_redacted FROM cross_repo_dependencies WHERE blueprint_slug = ?',
          )
          .all(slug) as CR[]) {
          const to =
            cd.is_redacted === 1 && cd.target_slug_hash
              ? `private/${cd.target_slug_hash.slice(0, 12)}`
              : `${cd.target_repo}/${cd.target_slug ?? '?'}`
          edges.push({ from: slug, to, type: 'cross-repo', redacted: cd.is_redacted === 1 })
        }
      }
    } finally {
      conn.close()
    }
    const nodeList = [...nodes.values()]
    const b = bytes(JSON.stringify({ nodes: nodeList, edges }))
    return jsonContent({
      summary: `Dependency graph from "${from}": ${nodeList.length} nodes, ${edges.length} edges`,
      nodes: nodeList,
      edges,
      failures: [],
      bytes: b,
      tokensSaved: 0,
    })
  } catch (e) {
    return err('ak_blueprint_depgraph failed', toStr(e))
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerBlueprintTools(registrar: ToolRegistrar, cwd: string): Promise<void> {
  await coldStartIfNeeded(cwd)

  registrar.registerTool(
    'ak_blueprint_query',
    'Run a pre-registered SQL template against the blueprint store. Returns { summary, rows_capped, rows, failures, bytes, tokensSaved }.',
    {
      type: 'object',
      properties: { template_id: { type: 'string' }, params: { type: 'object', default: {} } },
      required: ['template_id'],
    },
    undefined,
    (r) => handleQuery(cwd, r),
    { title: 'Blueprint Query', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'ak_blueprint_new',
    'Return a drafting bundle for a new blueprint (no LLM call). Returns { target_path, template, rules_context, examples, lifecycle_advice, validation_required }.',
    {
      type: 'object',
      properties: {
        title: { type: 'string' },
        complexity: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'], default: 'M' },
        goal_prompt: { type: 'string' },
        examples_count: { type: 'integer', minimum: 0, maximum: 5, default: 3 },
      },
      required: ['title', 'goal_prompt'],
    },
    undefined,
    (r) => handleNew(cwd, r),
    { title: 'Blueprint New', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'ak_blueprint_validate',
    'Validate _overview.md structure. Returns { valid, gaps }. Must pass before ak_blueprint_promote.',
    { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    undefined,
    (r) => handleValidate(cwd, r),
    { title: 'Blueprint Validate', readOnlyHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'ak_blueprint_task_next',
    'Return the next ready task (all deps done). Returns { summary, task }.',
    { type: 'object', properties: { blueprint: { type: 'string' } } },
    undefined,
    (r) => handleTaskNext(cwd, r),
    { title: 'Blueprint Task Next', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'ak_blueprint_task_advance',
    'Advance task status. Edits _overview.md and re-syncs DB. Returns { summary, old_status, new_status }.',
    {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        to: { type: 'string', enum: ['todo', 'in-progress', 'blocked', 'done', 'dropped'] },
      },
      required: ['task_id', 'to'],
    },
    undefined,
    (r) => handleTaskAdvance(cwd, r),
    { title: 'Blueprint Task Advance', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'ak_blueprint_promote',
    'Promote a blueprint to a new lifecycle state. Refuses without prior validate. Returns { summary, new_path }.',
    {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        to_state: {
          type: 'string',
          enum: ['planned', 'in-progress', 'completed', 'parked', 'archived'],
        },
      },
      required: ['slug', 'to_state'],
    },
    undefined,
    (r) => handlePromote(cwd, r),
    { title: 'Blueprint Promote', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'ak_blueprint_finalize',
    'Finalize a blueprint (move to completed). Refuses if any tasks are not done/dropped. Returns { summary, new_path }.',
    { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
    undefined,
    (r) => handleFinalize(cwd, r),
    { title: 'Blueprint Finalize', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'ak_blueprint_depgraph',
    'Build dependency graph from a blueprint slug. Private cross-org targets shown as private/<hash>. Returns { summary, nodes, edges }.',
    { type: 'object', properties: { from: { type: 'string' } }, required: ['from'] },
    undefined,
    (r) => handleDepgraph(cwd, r),
    { title: 'Blueprint Dep Graph', readOnlyHint: true, openWorldHint: false },
  )
}
