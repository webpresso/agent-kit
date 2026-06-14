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
 *   Iron rule: WP_BLUEPRINT_PLATFORM_DISABLED=1 skips the adapter entirely — the
 *   markdown-canonical path runs byte-identically to the pre-migration behaviour.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

import matter from 'gray-matter'
import { z } from 'zod'

import { parseBlueprint } from '#core/parser'
import { setBlueprintFrontmatterFields } from '#lifecycle/engine'
import { openDb } from '#db/connection.js'
import { resolveBlueprintProjectionDbPath } from '#db/paths.js'
import { findTemplate } from '#db/templates.js'
import { resolveBlueprintRoot } from '#utils/blueprint-root.js'
import { getBlueprintDocumentPaths } from '#utils/document-paths.js'
import type { BlueprintStatus } from '#utils/document-paths.js'
import { evidenceListSchema, canonicalizeEvidenceList } from '#evidence.js'
import { checkFreshness, readCurrentHead, readProjectionMetadata } from '#freshness.js'
import {
  applyVerification,
  assertAllTasksHaveCanonicalPassingEvidence,
  readTaskVerification,
} from '#verification.js'
import { makeNextAction } from '#next-action.js'
import { PROJECT_SOURCES, type BlueprintProjectRef } from '#projects.js'
import { ensureProjectionReady, reIngestProjection } from '#projection-ready.js'
import { createProjectResolver, type ProjectResolver } from '#project-resolver.js'
import { aggregateBlueprintRows, type ProjectReader } from '#aggregate.js'
import { resolveProjectRoot } from '#mcp/tools/_shared/project-root.js'
import { maybeHint } from './_tail-hints.js'
import type { ToolHandlerResult, ToolRegistrar } from './auto-discover.js'

import {
  resolveSyncAdapter,
  runPlatformMutationSync,
  _setSyncAdapterFactory,
  type SyncAdapter,
} from '#mcp/blueprint/_shared/sync'
import { err, finishPayload, jsonContent, parseStructuredJson } from '#mcp/blueprint/_shared/errors'
import { bytes, sortKeys, toStr } from '#mcp/blueprint/_shared/payload'
import {
  nextActionOutputSchema,
  summaryEnvelopeOutputSchema,
} from '#mcp/blueprint/_shared/schema'
import { readVt, writeVt } from '#mcp/blueprint/_shared/validation-timestamp'

export { _setSyncAdapterFactory }
export type { SyncAdapter }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROWS_CAP = 200
const DEFAULT_ROOTS_FETCH_TIMEOUT_MS = 750
const DEFAULT_PROJECT_DISCOVERY_TIMEOUT_MS = 1_500
const LIFECYCLE_ADVICE =
  'After creating: /plan-refine to harden; /plan-eng-review to validate; ' +
  'wp_blueprint_promote draft→planned when ready; /pll for parallel execution; ' +
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

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0] ?? new Date().toISOString()
}

function formatBlueprintProgress(
  totalTasks: number,
  doneTasks: number,
  blockedTasks: number,
): string {
  const percent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)
  return `${percent}% (${doneTasks}/${totalTasks} tasks done, ${blockedTasks} blocked, updated ${todayIsoDate()})`
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const dbPath = (cwd: string) => resolveBlueprintProjectionDbPath(cwd)
function readBoundedTimeoutMs(envKey: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[envKey] ?? String(fallback), 10)
  return Math.max(1, Number.isFinite(parsed) ? parsed : fallback)
}

async function awaitBounded<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timeoutId: NodeJS.Timeout | undefined
  try {
    const value = await Promise.race([
      promise.then((resolved) => ({ timedOut: false as const, value: resolved })),
      new Promise<{ timedOut: true }>((resolve) => {
        timeoutId = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
      }),
    ])
    return value
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
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
  await reIngestProjection(cwd)
}

async function persistBlueprintMarkdown(input: {
  projectCwd: string
  slug: string
  blueprintPath: string
  markdown: string
}) {
  const { projectCwd, slug, blueprintPath, markdown } = input
  mkdirSync(path.dirname(blueprintPath), { recursive: true })
  parseBlueprint(markdown, slug)
  writeFileSync(blueprintPath, markdown, 'utf8')
  await reIngest(projectCwd)
  const refreshed = getCurrentProjectBlueprint(projectCwd, slug)
  if (!refreshed.blueprint) {
    throw new Error(`Blueprint "${slug}" did not appear in the projection after write`)
  }
  return refreshed.blueprint
}

function findBlueprintDir(
  blueprintRoot: string,
  slug: string,
  states: readonly BlueprintStatus[],
): { dir: string; path: string; shape: 'flat' | 'folder'; state: BlueprintStatus } | null {
  for (const state of states) {
    const paths = getBlueprintDocumentPaths(blueprintRoot, state, slug)
    if (existsSync(paths.flat))
      return { dir: path.dirname(paths.flat), path: paths.flat, shape: 'flat', state }
    if (existsSync(paths.directory))
      return { dir: paths.directory, path: paths.folder, shape: 'folder', state }
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

function projectCandidateView(project: BlueprintProjectRef): Record<string, unknown> {
  return {
    project_id: project.project_id,
    label: project.label,
    worktree_path: project.worktree_path,
    repo_path: project.repo_path,
    source: project.source,
    has_blueprints: project.has_blueprints,
  }
}

function projectDisambiguationError(
  summary: string,
  hint: string,
  projects: ReadonlyArray<BlueprintProjectRef>,
): ToolHandlerResult {
  return jsonContent(
    {
      summary,
      failures: [hint],
      next_action: {
        ...makeNextAction('disambiguate_slug', hint),
        candidates: projects.map(projectCandidateView),
      },
      bytes: 0,
      tokensSaved: 0,
    },
    true,
  )
}

function resolveFallbackProjectCwd(cwd: string): string {
  try {
    return realpathSync(resolveProjectRoot({ cwd, env: process.env }))
  } catch {
    try {
      return realpathSync(cwd)
    } catch {
      return cwd
    }
  }
}

function buildFallbackCurrentProject(cwd: string): BlueprintProjectRef {
  const worktreePath = resolveFallbackProjectCwd(cwd)
  const blueprintRoot = resolveBlueprintRoot(worktreePath)
  const hasBlueprints = existsSync(blueprintRoot) && (() => statSync(blueprintRoot).isDirectory())()
  return {
    project_id: worktreePath,
    label: path.basename(worktreePath) || worktreePath,
    repo_path: worktreePath,
    worktree_path: worktreePath,
    source: PROJECT_SOURCES.current,
    has_blueprints: hasBlueprints,
    db_path: dbPath(worktreePath),
  }
}

async function resolveToolProject(
  projectResolver: ProjectResolver,
  cwd: string,
  projectId: string | undefined,
): Promise<{ cwd: string; project_id: string | null } | ToolHandlerResult> {
  const timed = await awaitBounded(
    projectResolver.resolve({ cwd, projectId }),
    readBoundedTimeoutMs(
      'WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS',
      DEFAULT_PROJECT_DISCOVERY_TIMEOUT_MS,
    ),
  )
  if (timed.timedOut) {
    if (projectId === undefined) return { cwd: resolveFallbackProjectCwd(cwd), project_id: null }
    try {
      return { cwd: realpathSync(projectId), project_id: null }
    } catch {
      return projectDisambiguationError(
        'Project discovery timed out',
        'Project discovery timed out. Retry with an explicit project path or call wp_blueprint_projects for a narrower target.',
        [],
      )
    }
  }
  const resolved = timed.value
  if (resolved.ok) return { cwd: resolved.cwd, project_id: resolved.project_id }
  return projectDisambiguationError(resolved.summary, resolved.hint, resolved.candidates)
}

type MutationToolName =
  | 'wp_blueprint_create'
  | 'wp_blueprint_put'
  | 'wp_blueprint_transition'
  | 'wp_blueprint_task_advance'
  | 'wp_blueprint_task_verify'

type MutationRequestLedgerRow = {
  payload_hash: string
  response_json: string
}

function hashMutationPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortKeys(payload)))
    .digest('hex')
}

function mutationFreshnessError(
  toolName: string,
  guidanceTool: 'wp_blueprint_list' | 'wp_blueprint_get',
) {
  return jsonContent(
    {
      summary: `${toolName} rejected a stale mutation token`,
      failures: [
        'head_at_ingest does not match the current repository HEAD. Refresh blueprint state before mutating.',
      ],
      error: 'stale_head_at_ingest',
      next_action: makeNextAction(
        'reingest_project',
        `Refresh projection state, then call ${guidanceTool} again to obtain a fresh head_at_ingest token.`,
      ),
      bytes: 0,
      tokensSaved: 0,
    },
    true,
  )
}

function validateMutationFreshnessToken(
  projectCwd: string,
  headAtIngest: string | null | undefined,
  toolName: string,
  guidanceTool: 'wp_blueprint_list' | 'wp_blueprint_get',
): ToolHandlerResult | null {
  if (headAtIngest === undefined) return null
  const currentHead = readCurrentHead(projectCwd)
  if (headAtIngest === currentHead) return null
  return mutationFreshnessError(toolName, guidanceTool)
}

function readMutationReplay(
  cwd: string,
  toolName: MutationToolName,
  requestId: string,
  payloadHash: string,
): ToolHandlerResult | null {
  const target = dbPath(cwd)
  if (!existsSync(target)) return null
  const conn = openDb(target)
  try {
    const row =
      conn.db
        .prepare<[string, string], MutationRequestLedgerRow>(
          `SELECT payload_hash, response_json
             FROM mutation_request_ledger
            WHERE tool_name = ? AND request_id = ?
            LIMIT 1`,
        )
        .get(toolName, requestId) ?? null
    if (row === null) return null
    if (row.payload_hash !== payloadHash) {
      return err(
        `${toolName} failed`,
        `request_id "${requestId}" was already used with a different payload`,
      )
    }
    const payload = JSON.parse(row.response_json) as Record<string, unknown>
    payload['idempotent'] = true
    return finishPayload(payload)
  } finally {
    conn.close()
  }
}

function recordMutationReplay(
  cwd: string,
  toolName: MutationToolName,
  requestId: string,
  payloadHash: string,
  payload: Record<string, unknown>,
): void {
  const conn = openDbRW(cwd)
  try {
    conn.db
      .prepare<[string, string, string, string]>(
        `INSERT OR REPLACE INTO mutation_request_ledger
           (tool_name, request_id, payload_hash, response_json)
         VALUES (?, ?, ?, ?)`,
      )
      .run(toolName, requestId, payloadHash, JSON.stringify(payload))
  } finally {
    conn.close()
  }
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
  const blueprintStatus = String((fm.data as Record<string, unknown>)['status'] ?? '').trim()
  const requiredFields =
    blueprintStatus === 'draft'
      ? (['type', 'status'] as const)
      : (['type', 'title', 'status', 'complexity', 'owner', 'last_updated'] as const)
  for (const f of requiredFields) {
    const v = (fm.data as Record<string, unknown>)[f]
    if (!v || String(v).trim() === '') gaps.push(`Missing or empty frontmatter field: ${f}`)
  }
  const complexity = String((fm.data as Record<string, unknown>)['complexity'] ?? '').trim()
  if (complexity && !['XS', 'S', 'M', 'L', 'XL'].includes(complexity)) {
    gaps.push(`Invalid frontmatter field: complexity (${complexity})`)
  }
  const lastUpdated = String((fm.data as Record<string, unknown>)['last_updated'] ?? '').trim()
  if (lastUpdated && !/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated.replace(/^['"]|['"]$/g, ''))) {
    gaps.push(`Invalid frontmatter field: last_updated (${lastUpdated})`)
  }
  const body = fm.content
  const taskHeaderRegex = /^####\s+(?:\[[^\]]+\]\s+)?Task\s+\S/m
  if (!taskHeaderRegex.test(body)) gaps.push('No "#### Task" sections found')
  for (const block of body
    .split(/(?=^####\s+(?:\[[^\]]+\]\s+)?Task\s)/m)
    .filter((b) => /^####\s+(?:\[[^\]]+\]\s+)?Task\s/.test(b.trimStart()))) {
    const label =
      /^####\s+(?:\[[^\]]+\]\s+)?Task\s+([\d.]+[:\s]+.+)/m.exec(block)?.[1]?.trim() ?? '(unknown)'
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
  if (!p.success) return err('wp_blueprint_query validation error', p.error.message)
  const { template_id, params } = p.data
  const tmpl = findTemplate(template_id)
  if (!tmpl)
    return err(`Unknown query template: ${template_id}`, `Template "${template_id}" not found.`)
  try {
    await ensureProjectionReady(cwd)
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
  if (!p.success) return err('wp_blueprint_new validation error', p.error.message)
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
  const targetPath = getBlueprintDocumentPaths(resolveBlueprintRoot(cwd), 'draft', slug).flat

  // Platform-first path: push event to register the blueprint before returning the scaffold.
  // Iron rule: resolveSyncAdapter() returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(cwd)
  try {
    await runPlatformMutationSync(adapter, {
      label: 'wp_blueprint_new',
      event: {
        eventId: randomUUID(),
        repoId: process.env['WP_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
        occurredAt: new Date().toISOString(),
        type: 'blueprint.created',
        payload: {
          type: 'blueprint.created',
          slug,
          title,
          complexity,
          status: 'draft',
        },
      },
    })
  } catch (e) {
    return err('wp_blueprint_new failed', toStr(e))
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
  if (!p.success) return err('wp_blueprint_validate validation error', p.error.message)
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

const taskNextSchema = z.object({
  blueprint: z.string().optional(),
  project_id: z.string().optional(),
})
async function handleTaskNext(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = taskNextSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_task_next validation error', p.error.message)
  const { blueprint, project_id } = p.data
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const failures: string[] = []

  // Platform-first: refresh local replica before reading so the result reflects remote state.
  // Iron rule: resolveSyncAdapter() returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(projectCwd)
  if (adapter !== null) {
    const timeoutMs = Math.max(
      1,
      Number.parseInt(process.env['WP_BLUEPRINT_READ_FRESH_TIMEOUT_MS'] ?? '5000', 10) || 5000,
    )
    try {
      await Promise.race([
        adapter.ensureFresh(blueprint !== undefined ? { slug: blueprint } : undefined),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `ensureFresh timed out after ${timeoutMs}ms during wp_blueprint_task_next`,
                ),
              ),
            timeoutMs,
          )
        }),
      ])
    } catch (error) {
      failures.push(
        `Platform freshness refresh skipped: ${error instanceof Error ? error.message : toStr(error)}`,
      )
    }
  }

  const target = dbPath(projectCwd)
  if (!existsSync(target))
    return jsonContent({
      summary: 'No blueprint DB found',
      task: null,
      failures,
      bytes: 0,
      tokensSaved: 0,
    })
  const taskNextFreshness = checkFreshness({ worktree_path: projectCwd, db_path: target })
  if (!taskNextFreshness.ok) {
    return staleProjectionResponse('Blueprint projection is stale', taskNextFreshness.next_action, {
      task: null,
    })
  }
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
      failures,
      bytes: 0,
      tokensSaved: 0,
    }
    if (w0cnt >= 3) appendHint(payload, projectCwd, 'PLL_PARALLEL')
    return finishPayload(payload)
  } catch (e) {
    return err('wp_blueprint_task_next failed', toStr(e))
  }
}

const advanceSchema = z.object({
  project_id: z.string(),
  task_id: z.string(),
  to: z.enum(['todo', 'in-progress', 'blocked', 'done', 'dropped']),
  request_id: z.string().min(1).optional(),
  head_at_ingest: z.string().nullable().optional(),
})
async function handleTaskAdvance(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = advanceSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_task_advance validation error', p.error.message)
  const { project_id, task_id, to, request_id, head_at_ingest } = p.data
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const freshnessFailure = validateMutationFreshnessToken(
    projectCwd,
    head_at_ingest,
    'wp_blueprint_task_advance',
    'wp_blueprint_list',
  )
  if (freshnessFailure) return freshnessFailure
  const payloadHash = hashMutationPayload({ task_id, to })
  const replay =
    request_id !== undefined
      ? readMutationReplay(projectCwd, 'wp_blueprint_task_advance', request_id, payloadHash)
      : null
  if (replay) return replay

  // Task 3.2 guard: refuse to mark done via advance — require evidence via wp_blueprint_task_verify
  if (to === 'done') {
    return jsonContent(
      {
        summary: 'Use wp_blueprint_task_verify to mark tasks done with evidence',
        failures: ['Use wp_blueprint_task_verify to mark tasks done with evidence'],
        error: 'Use wp_blueprint_task_verify to mark tasks done with evidence',
        next_action: makeNextAction(
          'verify_task',
          'Call wp_blueprint_task_verify with evidence items',
        ),
        bytes: 0,
        tokensSaved: 0,
      },
      true,
    )
  }

  const target = dbPath(projectCwd)
  if (!existsSync(target)) return err('wp_blueprint_task_advance failed', 'Blueprint DB not found')
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
      if (!row) return err('wp_blueprint_task_advance failed', `Task "${task_id}" not found in DB`)
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
    // Iron rule: resolveSyncAdapter() returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1.
    const adapter = await resolveSyncAdapter(projectCwd)
    if (blueprintSlug !== null && oldStatus !== null) {
      try {
        await runPlatformMutationSync(adapter, {
          label: 'wp_blueprint_task_advance',
          event: {
            eventId: randomUUID(),
            repoId: process.env['WP_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
            occurredAt: new Date().toISOString(),
            type: 'task.status_changed',
            payload: {
              type: 'task.status_changed',
              blueprintSlug,
              taskId: task_id,
              fromStatus: oldStatus,
              toStatus: to,
            },
          },
          ensureFreshSlug: blueprintSlug,
        })
      } catch (e) {
        return err('wp_blueprint_task_advance failed', toStr(e))
      }
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
      await reIngest(projectCwd)
    } catch {
      /* non-fatal */
    }
    const payload: Record<string, unknown> = {
      summary: `Task "${task_id}" advanced from "${oldStatus}" to "${to}"`,
      task_id,
      old_status: oldStatus,
      new_status: to,
      idempotent: false,
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    }
    if (request_id !== undefined) {
      recordMutationReplay(
        projectCwd,
        'wp_blueprint_task_advance',
        request_id,
        payloadHash,
        payload,
      )
    }
    return finishPayload(payload)
  } catch (e) {
    return err('wp_blueprint_task_advance failed', toStr(e))
  }
}

// Task 3.2 — wp_blueprint_task_verify
const taskVerifySchema = z.object({
  project_id: z.string(),
  slug: z.string(),
  task_id: z.string(),
  evidence: evidenceListSchema,
  request_id: z.string().min(1).optional(),
  head_at_ingest: z.string().nullable().optional(),
})

async function handleTaskVerify(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = taskVerifySchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_task_verify validation error', p.error.message)
  const { project_id, slug, task_id, evidence, request_id, head_at_ingest } = p.data
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const freshnessFailure = validateMutationFreshnessToken(
    projectCwd,
    head_at_ingest,
    'wp_blueprint_task_verify',
    'wp_blueprint_get',
  )
  if (freshnessFailure) return freshnessFailure
  const payloadHash = hashMutationPayload({ slug, task_id, evidence })
  const replay =
    request_id !== undefined
      ? readMutationReplay(projectCwd, 'wp_blueprint_task_verify', request_id, payloadHash)
      : null
  if (replay) return replay

  // Locate the blueprint markdown file on disk
  const root = resolveBlueprintRoot(projectCwd)
  const found = findBlueprintDir(root, slug, ALL_STATES)
  if (!found) {
    return err(
      'wp_blueprint_task_verify failed',
      `Blueprint "${slug}" not found in any state directory`,
    )
  }
  const filePath = found.path
  if (!existsSync(filePath)) {
    return err('wp_blueprint_task_verify failed', `Blueprint overview not found at ${filePath}`)
  }

  const markdownBefore = readFileSync(filePath, 'utf8')

  // Idempotency check: if the task already has the same canonical evidence block, skip write.
  // We check this BEFORE calling applyVerification to avoid whitespace normalization drift
  // making `result.markdown !== markdownBefore` always true even for identical evidence.
  const incomingCanonical = canonicalizeEvidenceList(evidence)
  const existingEvidence = readTaskVerification(markdownBefore, task_id)
  if (
    existingEvidence !== null &&
    canonicalizeEvidenceList(existingEvidence) === incomingCanonical
  ) {
    const nextPayload = parseStructuredJson(
      await handleTaskNext(projectResolver, projectCwd, {
        blueprint: slug,
        project_id: resolvedProject.project_id ?? projectCwd,
      }),
    )
    const payload: Record<string, unknown> = {
      summary: `Task "${task_id}" verification is already recorded (idempotent)`,
      status: 'done',
      idempotent: true,
      next_summary:
        typeof nextPayload['summary'] === 'string'
          ? nextPayload['summary']
          : 'No ready tasks found',
      next_task:
        typeof nextPayload['task'] === 'object' && nextPayload['task'] !== null
          ? nextPayload['task']
          : null,
      failures: [],
      bytes: bytes(markdownBefore),
      tokensSaved: 0,
    }
    if (request_id !== undefined) {
      recordMutationReplay(projectCwd, 'wp_blueprint_task_verify', request_id, payloadHash, payload)
    }
    return finishPayload(payload)
  }

  // Apply verification (pure function — no FS side effects)
  const result = applyVerification(markdownBefore, task_id, evidence)

  if (!result.ok) {
    return jsonContent(
      {
        summary: 'Verification failed',
        failures: result.failures,
        next_action: makeNextAction('verify_task', result.failures[0] ?? 'Verification failed'),
        bytes: 0,
        tokensSaved: 0,
      },
      true,
    )
  }

  // Write updated markdown back to disk
  writeFileSync(filePath, result.markdown, 'utf8')

  // Re-ingest so the DB projection reflects the completed status
  try {
    await reIngest(projectCwd)
  } catch {
    /* non-fatal */
  }

  const b = bytes(result.markdown)
  const nextPayload = parseStructuredJson(
    await handleTaskNext(projectResolver, projectCwd, {
      blueprint: slug,
      project_id: resolvedProject.project_id ?? projectCwd,
    }),
  )
  const payload: Record<string, unknown> = {
    summary: `Task "${task_id}" verified and marked done`,
    status: 'done',
    idempotent: false,
    next_summary:
      typeof nextPayload['summary'] === 'string' ? nextPayload['summary'] : 'No ready tasks found',
    next_task:
      typeof nextPayload['task'] === 'object' && nextPayload['task'] !== null
        ? nextPayload['task']
        : null,
    failures: [],
    bytes: b,
    tokensSaved: 0,
  }
  if (request_id !== undefined) {
    recordMutationReplay(projectCwd, 'wp_blueprint_task_verify', request_id, payloadHash, payload)
  }
  return finishPayload(payload)
}

const promoteSchema = z.object({
  project_id: z.string().optional(),
  slug: z.string(),
  to_state: z.enum(['planned', 'in-progress', 'completed', 'parked', 'archived']),
})
async function handlePromote(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = promoteSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_promote validation error', p.error.message)
  const { project_id, slug, to_state } = p.data
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  const root = resolveBlueprintRoot(projectCwd)
  const found = findBlueprintDir(root, slug, ALL_STATES)
  if (!found)
    return err(
      'wp_blueprint_promote failed',
      `Blueprint "${slug}" not found in any state directory`,
    )
  const { state: currentState } = found
  const overviewPath = found.path

  if (to_state === 'completed') {
    try {
      assertBlueprintCanComplete(overviewPath, slug)
    } catch (error) {
      return err('wp_blueprint_promote refused', toStr(error))
    }
  }
  // Platform-first path: push event + pull fresh replica before local move.
  // Iron rule: resolveSyncAdapter() returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(projectCwd)
  try {
    await runPlatformMutationSync(adapter, {
      label: 'wp_blueprint_promote',
      event: {
        eventId: randomUUID(),
        repoId: process.env['WP_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
        occurredAt: new Date().toISOString(),
        type: 'blueprint.status_changed',
        payload: {
          type: 'blueprint.status_changed',
          slug,
          fromStatus: currentState,
          toStatus: to_state,
        },
      },
      ensureFreshSlug: slug,
    })
  } catch (e) {
    return err('wp_blueprint_promote failed', toStr(e))
  }
  try {
    const transitioned = await applyLocalBlueprintTransition({
      found,
      projectCwd,
      slug,
      to_state,
    })
    const payload: Record<string, unknown> = {
      summary: `Blueprint "${slug}" promoted from "${currentState}" to "${to_state}"`,
      slug,
      from_state: currentState,
      to_state,
      new_path: transitioned.overviewPath,
      status: transitioned.blueprint.status,
      content_hash: transitioned.blueprint.content_hash,
      revision: transitioned.blueprint.content_hash,
      ingested_at: transitioned.blueprint.ingested_at,
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    }
    if (currentState === 'draft' && to_state === 'planned')
      appendHint(payload, projectCwd, 'PLAN_REFINE')
    return finishPayload(payload)
  } catch (e) {
    return err('wp_blueprint_promote failed', toStr(e))
  }
}

const finalizeSchema = z.object({ project_id: z.string().optional(), slug: z.string() })
async function handleFinalize(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = finalizeSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_finalize validation error', p.error.message)
  const { project_id, slug } = p.data
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const target = dbPath(projectCwd)
  if (!existsSync(target)) return err('wp_blueprint_finalize failed', 'Blueprint DB not found')
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
      'wp_blueprint_finalize refused',
      `Blueprint "${slug}" has open tasks: ${openTasks.map((t) => `${t.task_id} (${t.status})`).join(', ')}`,
    )
  const root = resolveBlueprintRoot(projectCwd)
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
    return err('wp_blueprint_finalize failed', `Blueprint "${slug}" not found`)
  }

  try {
    assertBlueprintCanComplete(found.path, slug)
  } catch (error) {
    return err('wp_blueprint_finalize refused', toStr(error))
  }

  // Platform-first path: push event + pull fresh replica before local move.
  // Iron rule: resolveSyncAdapter() returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(projectCwd)
  try {
    await runPlatformMutationSync(adapter, {
      label: 'wp_blueprint_finalize',
      event: {
        eventId: randomUUID(),
        repoId: process.env['WP_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
        occurredAt: new Date().toISOString(),
        type: 'blueprint.finalized',
        payload: {
          type: 'blueprint.finalized',
          slug,
        },
      },
      ensureFreshSlug: slug,
    })
  } catch (e) {
    return err('wp_blueprint_finalize failed', toStr(e))
  }
  try {
    const transitioned = await applyLocalBlueprintTransition({
      found,
      projectCwd,
      slug,
      to_state: 'completed',
    })
    const payload: Record<string, unknown> = {
      summary: `Blueprint "${slug}" finalized and moved to completed`,
      slug,
      new_path: transitioned.overviewPath,
      status: transitioned.blueprint.status,
      content_hash: transitioned.blueprint.content_hash,
      revision: transitioned.blueprint.content_hash,
      ingested_at: transitioned.blueprint.ingested_at,
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    }
    if (hasRecentAuditFinding(projectCwd)) appendHint(payload, projectCwd, 'AUDIT_FIX')
    return finishPayload(payload)
  } catch (e) {
    return err('wp_blueprint_finalize failed', toStr(e))
  }
}

function assertBlueprintCanComplete(overviewPath: string, slug: string): void {
  const markdown = readFileSync(overviewPath, 'utf8')
  const blueprint = parseBlueprint(markdown, slug)
  const unfinished = blueprint.tasks.filter(
    (task) => task.status !== 'done' && task.status !== 'dropped',
  )
  if (unfinished.length > 0) {
    const list = unfinished.map((task) => `${task.id} (${task.status})`).join(', ')
    throw new Error(`Cannot complete "${slug}": the following tasks are not done: ${list}`)
  }

  assertAllTasksHaveCanonicalPassingEvidence(
    markdown,
    blueprint.tasks.filter((task) => task.status !== 'dropped').map((task) => task.id),
  )
}

const depgraphSchema = z.object({ from: z.string() })
async function handleDepgraph(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = depgraphSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_depgraph validation error', p.error.message)
  const { from } = p.data
  await ensureProjectionReady(cwd)
  const target = dbPath(cwd)
  if (!existsSync(target)) return err('wp_blueprint_depgraph failed', 'Blueprint DB not found')
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
    return err('wp_blueprint_depgraph failed', toStr(e))
  }
}

// ---------------------------------------------------------------------------
// Task 2.2 handlers: list / get / context / create
// ---------------------------------------------------------------------------

// Zod target schemas (F15/E13)
const ReadTarget = z.object({
  project_id: z.string().optional(),
  scope: z.enum(['current', 'roots', 'workspace', 'all']).optional(),
})

const MutationTarget = z.object({
  project_id: z.string(),
  // NO scope field — enforced at type level per F15/E13
})

const listSchema = ReadTarget.extend({
  status: z.enum(['draft', 'planned', 'in-progress', 'completed', 'parked', 'archived']).optional(),
  limit: z.number().int().min(1).max(500).default(100),
})

type BpRow = {
  slug: string
  title: string
  status: string
  complexity: string | null
  owner: string | null
  last_updated: string | null
  content_hash: string
  ingested_at: number
  file_path: string
  [key: string]: unknown
}

const listBpReader: ProjectReader<BpRow> = ({ db }) => {
  // Reader used by both single-project and aggregate paths.
  // Callers layer on status/limit filters after the fact when using aggregate.
  const sql = `SELECT slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path FROM blueprints ORDER BY ingested_at DESC LIMIT 500`
  return db.prepare(sql).all() as unknown as BpRow[]
}

function staleProjectionResponse(
  summary: string,
  nextAction: ReturnType<typeof makeNextAction>,
  extra: Record<string, unknown>,
): ToolHandlerResult {
  return jsonContent({
    summary,
    failures: [],
    bytes: 0,
    tokensSaved: 0,
    ...extra,
    next_action: nextAction,
  })
}

function listCurrentProjectBlueprintRows(
  cwd: string,
  options: { readonly status?: string; readonly limit: number },
): BpRow[] {
  const target = dbPath(cwd)
  if (!existsSync(target)) return []
  const conn = openDb(target)
  try {
    const sql = options.status
      ? `SELECT slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path FROM blueprints WHERE status = ? ORDER BY ingested_at DESC LIMIT ?`
      : `SELECT slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path FROM blueprints ORDER BY ingested_at DESC LIMIT ?`
    return (options.status
      ? conn.db.prepare(sql).all(options.status, options.limit)
      : conn.db.prepare(sql).all(options.limit)) as unknown as BpRow[]
  } finally {
    conn.close()
  }
}

function getCurrentProjectBlueprint(
  cwd: string,
  slug: string,
): { blueprint: BpDetailRow | null; tasks: TaskRow[] } {
  const target = dbPath(cwd)
  if (!existsSync(target)) return { blueprint: null, tasks: [] }
  const conn = openDb(target)
  try {
    const blueprint =
      conn.db
        .prepare<[string], BpDetailRow>(
          `SELECT slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path FROM blueprints WHERE slug = ?`,
        )
        .get(slug) ?? null
    const tasks = blueprint
      ? (conn.db
          .prepare<[string], TaskRow>(
            `SELECT task_id, title, status, wave, lane FROM tasks WHERE blueprint_slug = ? ORDER BY id`,
          )
          .all(slug) as TaskRow[])
      : []
    return { blueprint, tasks }
  } finally {
    conn.close()
  }
}

async function handleBlueprintList(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = listSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_list validation error', p.error.message)
  const { status, limit, scope, project_id } = p.data

  // Multi-project path: scope is 'roots', 'workspace', or 'all'
  const isMultiScope = scope === 'roots' || scope === 'workspace' || scope === 'all'

  if (isMultiScope) {
    try {
      const target: { scope: typeof scope; project_id?: string } = { scope }
      if (project_id) target.project_id = project_id

      const timed = await awaitBounded(
        aggregateBlueprintRows<BpRow>({
          target,
          read: listBpReader,
          resolveOptions: { cwd },
        }),
        readBoundedTimeoutMs(
          'WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS',
          DEFAULT_PROJECT_DISCOVERY_TIMEOUT_MS,
        ),
      )
      if (timed.timedOut) {
        const fallbackCwd = resolveFallbackProjectCwd(cwd)
        const rows = listCurrentProjectBlueprintRows(fallbackCwd, { status, limit })
        const b = bytes(JSON.stringify(rows))
        return jsonContent({
          summary: `Project discovery timed out; returning ${rows.length} blueprint(s) from the current project only`,
          blueprints: rows,
          failures: ['project_discovery_timeout'],
          duplicate_slugs: [],
          freshness_ok: false,
          bytes: b,
          tokensSaved: 0,
        })
      }
      const result = timed.value

      let rows = result.rows as Array<BpRow & { project_id: string }>
      if (status) rows = rows.filter((r) => r.status === status)
      rows = rows.slice(0, limit)

      const b = bytes(JSON.stringify(rows))
      return jsonContent({
        summary: `Found ${rows.length} blueprint(s)${status ? ` with status "${status}"` : ''} across ${result.projects.length} project(s)`,
        blueprints: rows,
        failures: result.failures,
        duplicate_slugs: result.duplicate_slugs,
        freshness_ok: result.failures.length === 0,
        bytes: b,
        tokensSaved: 0,
      })
    } catch (e) {
      return err('wp_blueprint_list failed', toStr(e))
    }
  }

  // Single-project path: scope is 'current' or omitted
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const target = dbPath(projectCwd)
  if (!existsSync(target))
    return jsonContent({
      summary: 'No blueprint DB found — run wp_blueprint_new or trigger a re-ingest',
      blueprints: [],
      freshness_ok: false,
      next_action: { kind: 'rebuild_db', hint: 'Blueprint DB missing. Re-ingest to create it.' },
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    })

  const listFreshness = checkFreshness({ worktree_path: projectCwd, db_path: target })
  if (!listFreshness.ok) {
    return staleProjectionResponse('Blueprint projection is stale', listFreshness.next_action, {
      blueprints: [],
      project_id: resolvedProject.project_id ?? projectCwd,
      freshness_ok: false,
    })
  }

  try {
    const conn = openDb(target)
    let rows: BpRow[]
    try {
      const sql = status
        ? `SELECT slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path FROM blueprints WHERE status = ? ORDER BY ingested_at DESC LIMIT ?`
        : `SELECT slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path FROM blueprints ORDER BY ingested_at DESC LIMIT ?`
      rows = (status
        ? conn.db.prepare(sql).all(status, limit)
        : conn.db.prepare(sql).all(limit)) as unknown as BpRow[]
    } finally {
      conn.close()
    }

    const b = bytes(JSON.stringify(rows))
    return jsonContent({
      summary: `Found ${rows.length} blueprint(s)${status ? ` with status "${status}"` : ''}`,
      blueprints: rows,
      project_id: resolvedProject.project_id ?? projectCwd,
      freshness_ok: true,
      failures: [],
      bytes: b,
      tokensSaved: 0,
    })
  } catch (e) {
    return err('wp_blueprint_list failed', toStr(e))
  }
}

const getSchema = ReadTarget.extend({ slug: z.string() })

type BpDetailRow = {
  slug: string
  title: string
  status: string
  complexity: string | null
  owner: string | null
  last_updated: string | null
  content_hash: string
  ingested_at: number
  file_path: string
  [key: string]: unknown
}

interface TaskRow {
  task_id: string
  title: string
  status: string
  wave: string | null
  lane: string | null
}

async function handleBlueprintGet(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = getSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_get validation error', p.error.message)
  const { slug, scope, project_id } = p.data

  const isMultiScope = scope === 'roots' || scope === 'workspace' || scope === 'all'

  if (isMultiScope) {
    try {
      const readTarget: { scope: typeof scope; project_id?: string } = { scope }
      if (project_id) readTarget.project_id = project_id

      const timed = await awaitBounded(
        aggregateBlueprintRows<BpDetailRow>({
          target: readTarget,
          read: ({ db }) => {
            const row = db
              .prepare<[string], BpDetailRow>(
                `SELECT slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path FROM blueprints WHERE slug = ?`,
              )
              .get(slug)
            return row ? [row] : []
          },
          resolveOptions: { cwd },
        }),
        readBoundedTimeoutMs(
          'WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS',
          DEFAULT_PROJECT_DISCOVERY_TIMEOUT_MS,
        ),
      )
      if (timed.timedOut) {
        const fallbackCwd = resolveFallbackProjectCwd(cwd)
        const { blueprint, tasks } = getCurrentProjectBlueprint(fallbackCwd, slug)
        if (!blueprint) {
          return jsonContent({
            summary: `Project discovery timed out before "${slug}" could be searched outside the current project`,
            blueprint: null,
            content_hash: null,
            ingested_at: null,
            head_at_ingest: null,
            project_id: fallbackCwd,
            next_action: makeNextAction(
              'disambiguate_slug',
              'Project discovery timed out. Retry with an explicit project_id or a narrower scope.',
            ),
            failures: ['project_discovery_timeout'],
            bytes: 0,
            tokensSaved: 0,
          })
        }
        const blueprintWithTasks = { ...blueprint, tasks }
        const b = bytes(JSON.stringify(blueprintWithTasks))
        return jsonContent({
          summary: `Project discovery timed out; returning current-project match for "${slug}"`,
          blueprint: blueprintWithTasks,
          content_hash: blueprint.content_hash,
          ingested_at: blueprint.ingested_at,
          head_at_ingest: readProjectionMetadata(dbPath(fallbackCwd))?.head_at_ingest ?? null,
          project_id: fallbackCwd,
          failures: ['project_discovery_timeout'],
          bytes: b,
          tokensSaved: 0,
        })
      }
      const result = timed.value

      // Duplicate slug across projects — caller must disambiguate
      if (result.duplicate_slugs.includes(slug)) {
        const candidates = result.rows
          .filter((r) => r.slug === slug)
          .map((r) => ({ project_id: r.project_id, file_path: r.file_path }))
        return jsonContent({
          summary: `Blueprint "${slug}" found in multiple projects — disambiguation required`,
          blueprint: null,
          next_action: {
            ...makeNextAction(
              'disambiguate_slug',
              `Slug "${slug}" exists in ${candidates.length} projects. Specify project_id to disambiguate.`,
            ),
            candidates,
          },
          failures: result.failures,
          bytes: 0,
          tokensSaved: 0,
        })
      }

      const found = result.rows.find((r) => r.slug === slug)
      if (!found) {
        return jsonContent({
          summary: `Blueprint "${slug}" not found across ${result.projects.length} project(s)`,
          blueprint: null,
          next_action: makeNextAction(
            'disambiguate_slug',
            `No blueprint with slug "${slug}" found. Check the slug or re-ingest.`,
          ),
          failures: result.failures,
          bytes: 0,
          tokensSaved: 0,
        })
      }

      // Fetch tasks from the owning project's DB
      const owningProject = result.projects.find((pr) => pr.project_id === found.project_id)
      let tasks: TaskRow[] = []
      if (owningProject) {
        const owningDbPath = dbPath(owningProject.worktree_path)
        if (existsSync(owningDbPath)) {
          const conn = openDb(owningDbPath)
          try {
            tasks = conn.db
              .prepare<[string], TaskRow>(
                `SELECT task_id, title, status, wave, lane FROM tasks WHERE blueprint_slug = ? ORDER BY id`,
              )
              .all(slug) as TaskRow[]
          } finally {
            conn.close()
          }
        }
      }
      const headAtIngest = owningProject
        ? (readProjectionMetadata(dbPath(owningProject.worktree_path))?.head_at_ingest ?? null)
        : null

      const blueprintWithTasks = { ...found, tasks }
      const b = bytes(JSON.stringify(blueprintWithTasks))
      return jsonContent({
        summary: `Blueprint "${slug}": ${found.status}, ${tasks.length} task(s) [project: ${found.project_id}]`,
        blueprint: blueprintWithTasks,
        content_hash: found.content_hash,
        ingested_at: found.ingested_at,
        head_at_ingest: headAtIngest,
        project_id: found.project_id,
        failures: result.failures,
        bytes: b,
        tokensSaved: 0,
      })
    } catch (e) {
      return err('wp_blueprint_get failed', toStr(e))
    }
  }

  // Single-project path
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const target = dbPath(projectCwd)
  if (!existsSync(target))
    return jsonContent({
      summary: 'No blueprint DB found',
      blueprint: null,
      next_action: makeNextAction('rebuild_db', 'Blueprint DB missing. Re-ingest to create it.'),
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    })

  const getFreshness = checkFreshness({ worktree_path: projectCwd, db_path: target })
  if (!getFreshness.ok) {
    return staleProjectionResponse('Blueprint projection is stale', getFreshness.next_action, {
      blueprint: null,
      content_hash: null,
      ingested_at: null,
      head_at_ingest: null,
      project_id: resolvedProject.project_id ?? projectCwd,
    })
  }

  try {
    const conn = openDb(target)
    let blueprint: BpDetailRow | null
    let tasks: TaskRow[]
    try {
      blueprint =
        conn.db
          .prepare<[string], BpDetailRow>(
            `SELECT slug, title, status, complexity, owner, last_updated, content_hash, ingested_at, file_path FROM blueprints WHERE slug = ?`,
          )
          .get(slug) ?? null
      tasks = blueprint
        ? (conn.db
            .prepare<[string], TaskRow>(
              `SELECT task_id, title, status, wave, lane FROM tasks WHERE blueprint_slug = ? ORDER BY id`,
            )
            .all(slug) as TaskRow[])
        : []
    } finally {
      conn.close()
    }

    if (!blueprint) {
      return jsonContent({
        summary: `Blueprint "${slug}" not found`,
        blueprint: null,
        next_action: makeNextAction(
          'disambiguate_slug',
          `No blueprint with slug "${slug}" found in the DB. Check the slug or re-ingest.`,
        ),
        failures: [`Blueprint "${slug}" not found`],
        bytes: 0,
        tokensSaved: 0,
      })
    }

    const result = { ...blueprint, tasks }
    const b = bytes(JSON.stringify(result))
    const headAtIngest = readProjectionMetadata(target)?.head_at_ingest ?? null
    return jsonContent({
      summary: `Blueprint "${slug}": ${blueprint.status}, ${tasks.length} task(s)`,
      blueprint: result,
      content_hash: blueprint.content_hash,
      ingested_at: blueprint.ingested_at,
      head_at_ingest: headAtIngest,
      project_id: resolvedProject.project_id ?? projectCwd,
      failures: [],
      bytes: b,
      tokensSaved: 0,
    })
  } catch (e) {
    return err('wp_blueprint_get failed', toStr(e))
  }
}

const contextSchema = ReadTarget.extend({
  slug: z.string(),
  task_id: z.string().optional(),
})

async function handleBlueprintContext(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = contextSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_context validation error', p.error.message)
  const { slug, task_id, project_id } = p.data

  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const target = dbPath(projectCwd)
  if (!existsSync(target))
    return jsonContent({
      summary: 'No blueprint DB found',
      chunks: [],
      total_bytes: 0,
      next_action: makeNextAction('rebuild_db', 'Blueprint DB missing. Re-ingest to create it.'),
      failures: [],
      bytes: 0,
      tokensSaved: 0,
    })

  const contextFreshness = checkFreshness({ worktree_path: projectCwd, db_path: target })
  if (!contextFreshness.ok) {
    return staleProjectionResponse('Blueprint projection is stale', contextFreshness.next_action, {
      chunks: [],
      total_bytes: 0,
      content_hash: null,
      ingested_at: null,
      head_at_ingest: null,
      project_id: resolvedProject.project_id ?? projectCwd,
    })
  }

  try {
    const conn = openDb(target)
    interface BpCtxRow {
      slug: string
      title: string
      status: string
      complexity: string | null
      file_path: string
      last_updated: string | null
      content_hash: string
      ingested_at: number
    }
    interface TaskCtxRow {
      task_id: string
      title: string
      status: string
      description: string | null
      acceptance_json: string | null
      wave: string | null
    }
    let blueprint: BpCtxRow | null
    let tasks: TaskCtxRow[]
    try {
      blueprint =
        conn.db
          .prepare<[string], BpCtxRow>(
            `SELECT slug, title, status, complexity, file_path, last_updated, content_hash, ingested_at FROM blueprints WHERE slug = ?`,
          )
          .get(slug) ?? null
      tasks = blueprint
        ? (conn.db
            .prepare<[string], TaskCtxRow>(
              `SELECT task_id, title, status, description, acceptance_json, wave FROM tasks WHERE blueprint_slug = ? ORDER BY id`,
            )
            .all(slug) as TaskCtxRow[])
        : []
    } finally {
      conn.close()
    }

    if (!blueprint) {
      return jsonContent({
        summary: `Blueprint "${slug}" not found`,
        chunks: [],
        total_bytes: 0,
        next_action: makeNextAction(
          'disambiguate_slug',
          `No blueprint with slug "${slug}" found. Check the slug or re-ingest.`,
        ),
        failures: [`Blueprint "${slug}" not found`],
        bytes: 0,
        tokensSaved: 0,
      })
    }

    // Assemble context chunks inline to preserve the existing MCP payload shape.
    const chunks: Array<{ kind: string; label: string; content: string; byte_size: number }> = []

    const summaryContent = `# ${blueprint.title}\nStatus: ${blueprint.status}\nComplexity: ${blueprint.complexity ?? 'unset'}\nLast updated: ${blueprint.last_updated ?? 'unknown'}`
    chunks.push({
      kind: 'summary',
      label: `Blueprint: ${slug}`,
      content: summaryContent,
      byte_size: bytes(summaryContent),
    })

    const filteredTasks = task_id ? tasks.filter((t) => t.task_id === task_id) : tasks
    for (const t of filteredTasks) {
      const taskContent = `## Task ${t.task_id}: ${t.title}\nStatus: ${t.status}\nWave: ${t.wave ?? 'unset'}\n${t.description ?? ''}`
      chunks.push({
        kind: 'task',
        label: `Task ${t.task_id}`,
        content: taskContent,
        byte_size: bytes(taskContent),
      })
    }

    if (task_id && filteredTasks.length === 0) {
      return jsonContent({
        summary: `Task "${task_id}" not found in blueprint "${slug}"`,
        chunks: [],
        total_bytes: 0,
        next_action: makeNextAction(
          'verify_task',
          `Task "${task_id}" not found. Check the task_id or use wp_blueprint_get to list available tasks.`,
        ),
        failures: [`Task "${task_id}" not found in blueprint "${slug}"`],
        bytes: 0,
        tokensSaved: 0,
      })
    }

    const totalBytes = chunks.reduce((acc, c) => acc + c.byte_size, 0)
    const b = bytes(JSON.stringify(chunks))
    const headAtIngest = readProjectionMetadata(target)?.head_at_ingest ?? null
    return jsonContent({
      summary: `Context for "${slug}"${task_id ? ` task "${task_id}"` : ''}: ${chunks.length} chunk(s), ${totalBytes} bytes`,
      chunks,
      total_bytes: totalBytes,
      content_hash: blueprint.content_hash,
      ingested_at: blueprint.ingested_at,
      head_at_ingest: headAtIngest,
      project_id: resolvedProject.project_id ?? projectCwd,
      failures: [],
      bytes: b,
      tokensSaved: 0,
    })
  } catch (e) {
    return err('wp_blueprint_context failed', toStr(e))
  }
}

const createSchema = MutationTarget.extend({
  title: z.string(),
  goal: z.string(),
  complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']).default('M'),
  tags: z.array(z.string()).optional(),
  request_id: z.string().min(1).optional(),
  head_at_ingest: z.string().nullable().optional(),
})

const putTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['todo', 'in-progress', 'blocked', 'done', 'dropped']).default('todo'),
  wave: z.string().optional(),
  lane: z.string().optional(),
  description: z.string().optional(),
  acceptance: z.array(z.string().min(1)).min(1),
})

const putDocumentSchema = z.object({
  type: z.literal('blueprint').default('blueprint'),
  title: z.string().min(1),
  status: z.enum(['draft', 'planned', 'in-progress', 'completed', 'parked', 'archived']),
  complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']),
  owner: z.string().min(1),
  created: z.string().min(1),
  last_updated: z.string().min(1),
  progress: z.string().optional(),
  tags: z.array(z.string()).optional(),
  product_wedge_anchor: z.object({
    stage_outcome: z.string().min(1),
    consuming_surface: z.string().min(1),
    new_user_visible_capability: z.string().min(1),
  }),
  summary: z.string().min(1),
  tasks: z.array(putTaskSchema).min(1),
})

const putSchema = MutationTarget.extend({
  slug: z.string().min(1),
  document: putDocumentSchema,
  request_id: z.string().min(1).optional(),
  head_at_ingest: z.string().nullable().optional(),
})

function renderBlueprintMarkdownFromDocument(
  slug: string,
  document: z.infer<typeof putDocumentSchema>,
): string {
  const frontmatter = [
    '---',
    `type: ${document.type}`,
    `title: ${document.title}`,
    `status: ${document.status}`,
    `complexity: ${document.complexity}`,
    `owner: ${document.owner}`,
    `created: '${document.created}'`,
    `last_updated: '${document.last_updated}'`,
    ...(document.progress ? [`progress: ${JSON.stringify(document.progress)}`] : []),
    ...(document.tags && document.tags.length > 0
      ? ['tags:', ...document.tags.map((tag) => `  - ${tag}`)]
      : []),
    '---',
    '',
  ]

  const sections = [
    `# ${document.title}`,
    '',
    '## Product wedge anchor',
    '',
    `- **Stage outcome:** ${document.product_wedge_anchor.stage_outcome}`,
    `- **Consuming surface:** ${document.product_wedge_anchor.consuming_surface}`,
    `- **New user-visible capability:** ${document.product_wedge_anchor.new_user_visible_capability}`,
    '',
    '## Summary',
    '',
    document.summary,
    '',
  ]

  const taskBlocks = document.tasks.flatMap((task) => [
    `#### Task ${task.id}: ${task.title}`,
    '',
    `**Status:** ${task.status}`,
    ...(task.wave ? [`**Wave:** ${task.wave}`] : []),
    ...(task.lane ? [`**Lane:** ${task.lane}`] : []),
    ...(task.description ? ['', task.description] : []),
    '',
    '**Acceptance:**',
    ...task.acceptance.map((item) => `- [ ] ${item}`),
    '',
  ])

  return [...frontmatter, ...sections, ...taskBlocks].join('\n').trimEnd() + '\n'
}

async function handleBlueprintPut(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = putSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_put validation error', p.error.message)
  const { project_id, slug, document, request_id, head_at_ingest } = p.data
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const freshnessFailure = validateMutationFreshnessToken(
    projectCwd,
    head_at_ingest,
    'wp_blueprint_put',
    'wp_blueprint_get',
  )
  if (freshnessFailure) return freshnessFailure

  const payloadHash = hashMutationPayload({ slug, document })
  const replay =
    request_id !== undefined
      ? readMutationReplay(projectCwd, 'wp_blueprint_put', request_id, payloadHash)
      : null
  if (replay) return replay

  const root = resolveBlueprintRoot(projectCwd)
  const found = findBlueprintDir(root, slug, ALL_STATES)
  if (found && found.state !== document.status) {
    return err(
      'wp_blueprint_put refused',
      `Blueprint "${slug}" currently lives in "${found.state}" and cannot be rewritten as "${document.status}" without a lifecycle transition.`,
    )
  }
  if (!found && document.status !== 'draft') {
    return err(
      'wp_blueprint_put refused',
      `New blueprint "${slug}" must start in "draft"; use wp_blueprint_transition for later lifecycle moves.`,
    )
  }

  const overviewPath = found
    ? found.path
    : getBlueprintDocumentPaths(root, document.status as BlueprintStatus, slug).flat
  try {
    const markdown = renderBlueprintMarkdownFromDocument(slug, document)
    const blueprint = await persistBlueprintMarkdown({
      projectCwd,
      slug,
      blueprintPath: overviewPath,
      markdown,
    })
    const payload: Record<string, unknown> = {
      summary: `Blueprint "${slug}" written to ${overviewPath}`,
      slug,
      path: overviewPath,
      status: blueprint.status,
      content_hash: blueprint.content_hash,
      ingested_at: blueprint.ingested_at,
      revision: blueprint.content_hash,
      idempotent: false,
      failures: [],
      next_action: makeNextAction(
        'verify_task',
        'Blueprint written. Next: validate or transition the latest revision token through the structured surface.',
      ),
      project_id: resolvedProject.project_id ?? projectCwd,
    }
    if (request_id !== undefined) {
      recordMutationReplay(projectCwd, 'wp_blueprint_put', request_id, payloadHash, payload)
    }
    return finishPayload(payload)
  } catch (e) {
    return err('wp_blueprint_put failed', toStr(e))
  }
}

const transitionSchema = MutationTarget.extend({
  slug: z.string().min(1),
  to_state: z.enum(['draft', 'planned', 'in-progress', 'completed', 'parked', 'archived']),
  expected_version: z.string().min(1),
})

async function handleBlueprintTransition(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = transitionSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_transition validation error', p.error.message)
  const { project_id, slug, to_state, expected_version } = p.data
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const target = dbPath(projectCwd)
  if (!existsSync(target)) return err('wp_blueprint_transition failed', 'Blueprint DB not found')
  const current = getCurrentProjectBlueprint(projectCwd, slug)
  if (!current.blueprint) {
    return err('wp_blueprint_transition failed', `Blueprint "${slug}" not found`)
  }
  if (current.blueprint.content_hash !== expected_version) {
    return jsonContent(
      {
        summary: `wp_blueprint_transition rejected a stale blueprint revision`,
        failures: [
          `expected_version "${expected_version}" does not match current content hash "${current.blueprint.content_hash}"`,
        ],
        error: 'stale_blueprint_revision',
        next_action: makeNextAction(
          'reingest_project',
          'Call wp_blueprint_get again to fetch the latest content_hash before retrying the transition.',
        ),
        bytes: 0,
        tokensSaved: 0,
      },
      true,
    )
  }

  const root = resolveBlueprintRoot(projectCwd)
  const found = findBlueprintDir(root, slug, ALL_STATES)
  if (!found) return err('wp_blueprint_transition failed', `Blueprint "${slug}" not found on disk`)
  // Transitioning to `completed` must satisfy the same open-task gate as
  // finalize/promote — otherwise this path is a hole that completes a blueprint
  // with unfinished work. (terminal = done ∪ dropped, see assertBlueprintCanComplete.)
  if (to_state === 'completed') {
    try {
      assertBlueprintCanComplete(found.path, slug)
    } catch (error) {
      return err(
        'wp_blueprint_transition failed',
        error instanceof Error ? error.message : String(error),
      )
    }
  }
  try {
    const refreshed = await applyLocalBlueprintTransition({
      found,
      projectCwd,
      slug,
      to_state,
    })
    return finishPayload({
      summary: `Blueprint "${slug}" transitioned to ${to_state}`,
      slug,
      old_status: current.blueprint.status,
      new_status: to_state,
      status: refreshed.blueprint.status,
      content_hash: refreshed.blueprint.content_hash,
      revision: refreshed.blueprint.content_hash,
      ingested_at: refreshed.blueprint.ingested_at,
      failures: [],
      project_id: resolvedProject.project_id ?? projectCwd,
    })
  } catch (e) {
    return err('wp_blueprint_transition failed', toStr(e))
  }
}

async function applyLocalBlueprintTransition(input: {
  projectCwd: string
  slug: string
  to_state: string
  found: { dir: string; path: string; shape: 'flat' | 'folder'; state: string }
}) {
  const { projectCwd, slug, to_state, found } = input
  const root = resolveBlueprintRoot(projectCwd)
  const overviewPath = found.path
  const parsed = runValidate(overviewPath)
  if (!parsed.valid) {
    throw new Error(parsed.gaps.join('; '))
  }
  const markdown = readFileSync(overviewPath, 'utf8')
  const currentBlueprint = parseBlueprint(markdown, slug)
  const updated = setBlueprintFrontmatterFields(markdown, {
    status: to_state,
    last_updated: todayIsoDate(),
    completed_at: to_state === 'completed' ? todayIsoDate() : undefined,
    progress: formatBlueprintProgress(
      currentBlueprint.tasks.length,
      currentBlueprint.tasks.filter((task) => task.status === 'done').length,
      currentBlueprint.tasks.filter((task) => task.status === 'blocked').length,
    ),
  })
  parseBlueprint(updated, slug)
  const destination = getBlueprintDocumentPaths(root, to_state as BlueprintStatus, slug)
  mkdirSync(path.dirname(found.shape === 'flat' ? destination.flat : destination.directory), {
    recursive: true,
  })
  let finalOverviewPath = overviewPath
  if (found.state !== to_state) {
    const { renameSync } = await import('node:fs')
    renameSync(
      found.shape === 'flat' ? overviewPath : found.dir,
      found.shape === 'flat' ? destination.flat : destination.directory,
    )
    finalOverviewPath = found.shape === 'flat' ? destination.flat : destination.folder
  }
  writeFileSync(finalOverviewPath, updated, 'utf8')
  await reIngest(projectCwd)
  const refreshed = getCurrentProjectBlueprint(projectCwd, slug)
  if (!refreshed.blueprint) {
    throw new Error(`Blueprint "${slug}" did not appear in the projection after transition`)
  }
  return {
    blueprint: refreshed.blueprint,
    overviewPath: finalOverviewPath,
    fromState: found.state,
  }
}

async function handleBlueprintCreate(
  projectResolver: ProjectResolver,
  cwd: string,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const p = createSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_create validation error', p.error.message)
  const { project_id, title, goal, complexity, tags, request_id, head_at_ingest } = p.data
  const resolvedProject = await resolveToolProject(projectResolver, cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  await ensureProjectionReady(projectCwd)
  const freshnessFailure = validateMutationFreshnessToken(
    projectCwd,
    head_at_ingest,
    'wp_blueprint_create',
    'wp_blueprint_list',
  )
  if (freshnessFailure) return freshnessFailure
  const payloadHash = hashMutationPayload({ title, goal, complexity, tags: tags ?? [] })
  const replay =
    request_id !== undefined
      ? readMutationReplay(projectCwd, 'wp_blueprint_create', request_id, payloadHash)
      : null
  if (replay) return replay

  const today = new Date().toISOString().split('T')[0] ?? ''
  const slug = titleToSlug(title)
  const root = resolveBlueprintRoot(projectCwd)
  const overviewPath = getBlueprintDocumentPaths(root, 'draft', slug).flat

  try {
    mkdirSync(path.dirname(overviewPath), { recursive: true })
    const content = BLUEPRINT_TEMPLATE.replace(/{TITLE}/g, title)
      .replace(/{COMPLEXITY}/g, complexity)
      .replace(/{DATE}/g, today)
      .replace('{GOAL}', goal)
    await persistBlueprintMarkdown({
      projectCwd,
      slug,
      blueprintPath: overviewPath,
      markdown: content,
    })

    const b = bytes(content)
    const payload: Record<string, unknown> = {
      summary: `Blueprint "${slug}" created at ${overviewPath}`,
      slug,
      path: overviewPath,
      idempotent: false,
      next_action: makeNextAction(
        'verify_task',
        'Blueprint created. Next: run wp_blueprint_validate to check structure, then /plan-refine to harden, /plan-eng-review to validate architecture.',
      ),
      failures: [],
      bytes: b,
      tokensSaved: 0,
    }
    if (request_id !== undefined) {
      recordMutationReplay(projectCwd, 'wp_blueprint_create', request_id, payloadHash, payload)
    }
    return finishPayload(payload)
  } catch (e) {
    return err('wp_blueprint_create failed', toStr(e))
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerBlueprintTools(
  registrar: ToolRegistrar,
  cwd: string,
  projectResolver: ProjectResolver = createProjectResolver(),
): Promise<void> {
  registrar.registerTool(
    'wp_blueprint_query',
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
    'wp_blueprint_new',
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
    'wp_blueprint_put',
    'Create or replace a blueprint from a structured whole-document payload. Renders markdown, validates it, re-ingests the projection, and returns revision metadata.',
    {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        slug: { type: 'string' },
        document: { type: 'object' },
        request_id: { type: 'string' },
        head_at_ingest: { type: ['string', 'null'] },
      },
      required: ['project_id', 'slug', 'document'],
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        slug: { type: 'string' },
        path: { type: 'string' },
        status: { type: 'string' },
        content_hash: { type: 'string' },
        ingested_at: { type: 'number' },
        revision: { type: 'string' },
        idempotent: { type: 'boolean' },
        project_id: { type: 'string' },
        next_action: nextActionOutputSchema,
      },
    },
    (r) => handleBlueprintPut(projectResolver, cwd, r),
    { title: 'Blueprint Put', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_transition',
    'Transition a blueprint lifecycle state using an expected revision token. Revalidates the latest markdown, rewrites frontmatter atomically, re-ingests the projection, and returns updated revision metadata.',
    {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        slug: { type: 'string' },
        to_state: {
          type: 'string',
          enum: ['draft', 'planned', 'in-progress', 'completed', 'parked', 'archived'],
        },
        expected_version: { type: 'string' },
      },
      required: ['project_id', 'slug', 'to_state', 'expected_version'],
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        slug: { type: 'string' },
        old_status: { type: 'string' },
        new_status: { type: 'string' },
        status: { type: 'string' },
        content_hash: { type: 'string' },
        revision: { type: 'string' },
        ingested_at: { type: 'number' },
        project_id: { type: 'string' },
        next_action: nextActionOutputSchema,
      },
    },
    (r) => handleBlueprintTransition(projectResolver, cwd, r),
    { title: 'Blueprint Transition', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_validate',
    'Validate canonical blueprint markdown structure (`<slug>.md` or `<slug>/_overview.md`). Returns { valid, gaps }. Must pass before wp_blueprint_promote.',
    { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    undefined,
    (r) => handleValidate(cwd, r),
    { title: 'Blueprint Validate', readOnlyHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_task_next',
    'Return the next ready task (all deps done). Accepts optional project_id for nested-workspace disambiguation. Returns { summary, task }.',
    {
      type: 'object',
      properties: { blueprint: { type: 'string' }, project_id: { type: 'string' } },
    },
    undefined,
    (r) => handleTaskNext(projectResolver, cwd, r),
    { title: 'Blueprint Task Next', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_task_advance',
    'Advance task status. Edits the canonical blueprint markdown and re-syncs DB. Accepts optional request_id for idempotent retries and optional head_at_ingest from wp_blueprint_get/wp_blueprint_list to reject stale writes. Returns { summary, old_status, new_status, idempotent }.',
    {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        task_id: { type: 'string' },
        to: { type: 'string', enum: ['todo', 'in-progress', 'blocked', 'done', 'dropped'] },
        request_id: { type: 'string' },
        head_at_ingest: { type: ['string', 'null'] },
      },
      required: ['project_id', 'task_id', 'to'],
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        task_id: { type: 'string' },
        old_status: { type: ['string', 'null'] },
        new_status: { type: 'string' },
        idempotent: { type: 'boolean' },
        next_action: nextActionOutputSchema,
      },
    },
    (r) => handleTaskAdvance(projectResolver, cwd, r),
    { title: 'Blueprint Task Advance', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_promote',
    'Promote a blueprint to a new lifecycle state. Refuses without prior validate. Returns { summary, new_path }.',
    {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        slug: { type: 'string' },
        to_state: {
          type: 'string',
          enum: ['planned', 'in-progress', 'completed', 'parked', 'archived'],
        },
      },
      required: ['slug', 'to_state'],
    },
    undefined,
    (r) => handlePromote(projectResolver, cwd, r),
    { title: 'Blueprint Promote', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_finalize',
    'Finalize a blueprint (move to completed). Accepts optional project_id for nested-workspace disambiguation. Refuses if any tasks are not done/dropped. Returns { summary, new_path }.',
    {
      type: 'object',
      properties: { project_id: { type: 'string' }, slug: { type: 'string' } },
      required: ['slug'],
    },
    undefined,
    (r) => handleFinalize(projectResolver, cwd, r),
    { title: 'Blueprint Finalize', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_depgraph',
    'Build dependency graph from a blueprint slug. Private cross-org targets shown as private/<hash>. Returns { summary, nodes, edges }.',
    { type: 'object', properties: { from: { type: 'string' } }, required: ['from'] },
    undefined,
    (r) => handleDepgraph(cwd, r),
    { title: 'Blueprint Dep Graph', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_list',
    'List blueprints in a project from the SQLite projection. Supports optional status filter. Returns { blueprints, project_id, freshness_ok, next_action? }.',
    {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        scope: { type: 'string', enum: ['current', 'roots', 'workspace', 'all'] },
        status: {
          type: 'string',
          enum: ['draft', 'planned', 'in-progress', 'completed', 'parked', 'archived'],
        },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
      },
      required: [],
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        blueprints: { type: 'array', items: { type: 'object' } },
        project_id: { type: 'string' },
        freshness_ok: { type: 'boolean' },
        next_action: nextActionOutputSchema,
      },
      required: [
        ...summaryEnvelopeOutputSchema.required,
        'blueprints',
        'project_id',
        'freshness_ok',
      ],
    },
    (r) => handleBlueprintList(projectResolver, cwd, r),
    { title: 'Blueprint List', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_get',
    'Get a single blueprint by slug with task list and freshness metadata. Returns { blueprint, content_hash, ingested_at, next_action? }.',
    {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        project_id: { type: 'string' },
        scope: { type: 'string', enum: ['current', 'roots', 'workspace', 'all'] },
      },
      required: ['slug'],
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        blueprint: { type: ['object', 'null'] },
        content_hash: { type: ['string', 'null'] },
        ingested_at: { type: ['number', 'null'] },
        head_at_ingest: { type: ['string', 'null'] },
        project_id: { type: 'string' },
        next_action: nextActionOutputSchema,
      },
      required: [
        ...summaryEnvelopeOutputSchema.required,
        'blueprint',
        'content_hash',
        'ingested_at',
        'head_at_ingest',
        'project_id',
      ],
    },
    (r) => handleBlueprintGet(projectResolver, cwd, r),
    { title: 'Blueprint Get', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_context',
    'Assemble context chunks for a blueprint (and optionally a specific task). Returns { chunks, total_bytes, next_action? }.',
    {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        task_id: { type: 'string' },
        project_id: { type: 'string' },
        scope: { type: 'string', enum: ['current', 'roots', 'workspace', 'all'] },
      },
      required: ['slug'],
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        chunks: { type: 'array', items: { type: 'object' } },
        total_bytes: { type: 'number' },
        content_hash: { type: ['string', 'null'] },
        ingested_at: { type: ['number', 'null'] },
        head_at_ingest: { type: ['string', 'null'] },
        project_id: { type: 'string' },
        next_action: nextActionOutputSchema,
      },
      required: [...summaryEnvelopeOutputSchema.required, 'chunks', 'total_bytes', 'project_id'],
    },
    (r) => handleBlueprintContext(projectResolver, cwd, r),
    { title: 'Blueprint Context', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_create',
    'Create a new blueprint markdown under blueprints/draft/<slug>.md by default (folder-shaped `<slug>/_overview.md` remains supported elsewhere) and re-ingest. Accepts optional request_id for idempotent retries and optional head_at_ingest from wp_blueprint_projects/wp_blueprint_list to reject stale writes. Returns { slug, path, next_action, idempotent }.',
    {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        title: { type: 'string' },
        goal: { type: 'string' },
        complexity: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'], default: 'M' },
        tags: { type: 'array', items: { type: 'string' } },
        request_id: { type: 'string' },
        head_at_ingest: { type: ['string', 'null'] },
      },
      required: ['project_id', 'title', 'goal'],
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        slug: { type: 'string' },
        path: { type: 'string' },
        idempotent: { type: 'boolean' },
        next_action: nextActionOutputSchema,
      },
      required: [
        ...summaryEnvelopeOutputSchema.required,
        'slug',
        'path',
        'idempotent',
        'next_action',
      ],
    },
    (r) => handleBlueprintCreate(projectResolver, cwd, r),
    { title: 'Blueprint Create', destructiveHint: false, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_task_verify',
    'Mark a task done with an Evidence Contract. Requires at least one pass evidence item. Accepts optional request_id for idempotent retries, optional head_at_ingest from wp_blueprint_get/wp_blueprint_context to reject stale writes, and re-ingests DB on success. Returns { status, idempotent, next_action? }.',
    {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        slug: { type: 'string' },
        task_id: { type: 'string' },
        request_id: { type: 'string' },
        head_at_ingest: { type: ['string', 'null'] },
        evidence: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['test', 'integration', 'audit', 'manual'] },
              result: { type: 'string', enum: ['pass', 'fail'] },
              ts: { type: 'string' },
            },
            required: ['kind', 'result', 'ts'],
          },
        },
      },
      required: ['project_id', 'slug', 'task_id', 'evidence'],
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        status: { type: 'string' },
        idempotent: { type: 'boolean' },
        next_summary: { type: 'string' },
        next_task: { type: ['object', 'null'] },
        next_action: nextActionOutputSchema,
      },
    },
    (r) => handleTaskVerify(projectResolver, cwd, r),
    { title: 'Blueprint Task Verify', destructiveHint: false, openWorldHint: false },
  )
}

// ---------------------------------------------------------------------------
// Task 2.1 — single integration point for the main MCP server
// ---------------------------------------------------------------------------

/**
 * Options for {@link registerBlueprintServer}.
 *
 * @property cwd                Repo working directory (defaults to process.cwd()).
 * @property existingToolNames  Names of tools already registered by the
 *                              auto-discover step. Registration HARD-FAILS on
 *                              collision (F13/E15) — silent shadowing would
 *                              hide name drift from CI.
 * @property getMcpRoots        Lazy callback that returns the current MCP
 *                              client roots. Catch unsupported-capability
 *                              errors *inside* this callback or let them
 *                              throw — `wp_blueprint_projects` degrades
 *                              gracefully to current-cwd + warning.
 * @property onRootsListChanged Optional callback to install a notification
 *                              handler for `RootsListChangedNotificationSchema`.
 *                              When the client emits the notification, invoke
 *                              the callback (no args) and the roots cache will
 *                              be invalidated. Callers wire this via
 *                              `server.setNotificationHandler(...)` (F5).
 */
export interface RegisterBlueprintServerOptions {
  readonly cwd?: string
  readonly existingToolNames: ReadonlySet<string>
  readonly projectResolver?: ProjectResolver
  readonly getMcpRoots?: () => Promise<{
    readonly roots: ReadonlyArray<{ readonly uri: string; readonly name?: string }>
  }>
  readonly onRootsListChanged?: (handler: () => void) => void
}

const BLUEPRINT_SURFACE_TOOLS = [
  'wp_blueprint_query',
  'wp_blueprint_new',
  'wp_blueprint_validate',
  'wp_blueprint_task_next',
  'wp_blueprint_task_advance',
  'wp_blueprint_promote',
  'wp_blueprint_finalize',
  'wp_blueprint_depgraph',
  'wp_blueprint_projects',
] as const

/**
 * Wire the blueprint structured-store tools into the main MCP server.
 *
 * Single integration point (F13/E15): call this once from `createServer` AFTER
 * `auto-discover` finishes so tool-name collisions surface as a registration
 * error rather than silent shadow. Adds `wp_blueprint_projects` on top of the
 * 8 existing tools.
 *
 * Roots handling (F5):
 * - Roots are looked up lazily via `getMcpRoots` (callers pass a thunk that
 *   calls `server.listRoots()`). If the client does not support roots, the
 *   callback throws `assertClientCapability` — that throw is caught here, the
 *   tool result includes an `unsupported_roots` warning, and the current
 *   project still resolves from cwd.
 * - `onRootsListChanged` lets the caller hook a notification handler so the
 *   cached roots invalidate on the next read.
 */
export async function registerBlueprintServer(
  registrar: ToolRegistrar,
  options: RegisterBlueprintServerOptions,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const projectResolver = options.projectResolver ?? createProjectResolver()

  // F13/E15: hard-fail on collision before doing any work — silent shadowing
  // would hide the conflict until a downstream tool-call surfaced it.
  for (const name of BLUEPRINT_SURFACE_TOOLS) {
    if (options.existingToolNames.has(name)) {
      throw new Error(
        `[blueprint-server] tool name "${name}" collides with an auto-discovered tool; rename one of them before registering`,
      )
    }
  }

  // Register the 8 existing structured-store tools.
  await registerBlueprintTools(registrar, cwd, projectResolver)

  // Cached snapshot of the MCP client's roots, invalidated by list-changed.
  interface RootsCacheState {
    fetched: boolean
    roots: ReadonlyArray<{ readonly uri: string; readonly name?: string }>
    unsupported: boolean
    timedOut: boolean
  }
  const cache: RootsCacheState = { fetched: false, roots: [], unsupported: false, timedOut: false }

  async function ensureRoots(): Promise<RootsCacheState> {
    if (cache.fetched) return cache
    if (!options.getMcpRoots) {
      cache.fetched = true
      cache.roots = []
      cache.unsupported = false
      cache.timedOut = false
      return cache
    }
    try {
      const timed = await awaitBounded(
        options.getMcpRoots(),
        readBoundedTimeoutMs('WP_BLUEPRINT_ROOTS_TIMEOUT_MS', DEFAULT_ROOTS_FETCH_TIMEOUT_MS),
      )
      if (timed.timedOut) {
        cache.fetched = true
        cache.roots = []
        cache.unsupported = false
        cache.timedOut = true
        return cache
      }
      cache.fetched = true
      cache.roots = timed.value.roots
      cache.unsupported = false
      cache.timedOut = false
    } catch {
      // Roots capability missing on the client — degrade gracefully.
      cache.fetched = true
      cache.roots = []
      cache.unsupported = true
      cache.timedOut = false
    }
    return cache
  }

  if (options.onRootsListChanged) {
    options.onRootsListChanged(() => {
      cache.fetched = false
      cache.roots = []
      cache.unsupported = false
      cache.timedOut = false
    })
  }

  registrar.registerTool(
    'wp_blueprint_projects',
    'List blueprint-bearing projects from current cwd, MCP roots, workspace config, and git worktrees. Returns { summary, projects, warnings, next_action? }.',
    {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['current', 'roots', 'workspace', 'all'],
          default: 'all',
        },
      },
    },
    {
      ...summaryEnvelopeOutputSchema,
      properties: {
        ...summaryEnvelopeOutputSchema.properties,
        projects: { type: 'array', items: { type: 'object' } },
        warnings: { type: 'array', items: { type: 'string' } },
        next_action: nextActionOutputSchema,
      },
      required: [...summaryEnvelopeOutputSchema.required, 'projects', 'warnings'],
    },
    async (input) => handleProjects(projectResolver, cwd, ensureRoots, input),
    { title: 'Blueprint Projects', readOnlyHint: true, openWorldHint: false },
  )
}

async function handleProjects(
  projectResolver: ProjectResolver,
  cwd: string,
  ensureRoots: () => Promise<{
    fetched: boolean
    roots: ReadonlyArray<{ readonly uri: string; readonly name?: string }>
    unsupported: boolean
    timedOut: boolean
  }>,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const scopeSchema = z.object({
    scope: z.enum(['current', 'roots', 'workspace', 'all']).optional(),
  })
  const parsed = scopeSchema.safeParse(raw)
  const rootsState = await ensureRoots()

  const timedProjects = await awaitBounded(
    projectResolver.listVisibleProjects({
      cwd,
      rootsProvider:
        rootsState.roots.length > 0 ? async () => ({ roots: rootsState.roots }) : undefined,
    }),
    readBoundedTimeoutMs(
      'WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS',
      DEFAULT_PROJECT_DISCOVERY_TIMEOUT_MS,
    ),
  )
  const projects = timedProjects.timedOut ? [buildFallbackCurrentProject(cwd)] : timedProjects.value
  const scope = parsed.success ? (parsed.data.scope ?? 'all') : 'all'
  const filteredProjects = projects.filter((project) => {
    if (scope === 'all') return true
    if (scope === 'current') {
      return (
        project.source === PROJECT_SOURCES.current ||
        project.source === PROJECT_SOURCES.recursive_scan
      )
    }
    if (scope === 'roots') return project.source === PROJECT_SOURCES.mcp_roots
    return (
      project.source === PROJECT_SOURCES.workspace_config ||
      project.source === PROJECT_SOURCES.git_worktree
    )
  })

  const warnings: string[] = []
  if (rootsState.unsupported) warnings.push('unsupported_roots')
  if (rootsState.timedOut) warnings.push('roots_fetch_timeout')
  if (timedProjects.timedOut) warnings.push('project_discovery_timeout')

  const summary =
    filteredProjects.length === 0
      ? 'No blueprint-bearing projects found'
      : timedProjects.timedOut
        ? `Project discovery timed out; returning ${filteredProjects.length} current-project result${filteredProjects.length === 1 ? '' : 's'}`
        : `Found ${filteredProjects.length} project${filteredProjects.length === 1 ? '' : 's'}`

  const payload: Record<string, unknown> = {
    summary,
    projects: filteredProjects,
    warnings,
  }
  if (!timedProjects.timedOut) projectResolver.warm(projects)

  if (rootsState.unsupported) {
    payload.next_action = makeNextAction(
      'unsupported_roots',
      'MCP client does not advertise the roots capability; only the current cwd was scanned. Pass --roots explicitly or configure workspace.yaml.',
    )
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
  }
}
