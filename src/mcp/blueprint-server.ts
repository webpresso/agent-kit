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

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

import matter from 'gray-matter'
import { z } from 'zod'

import { coldStartIfNeeded } from '#db/cold-start.js'
import { openDb } from '#db/connection.js'
import { ingestAll } from '#db/ingester.js'
import { resolveBlueprintProjectionDbPath, withProjectionDbWriteLock } from '#db/paths.js'
import { findTemplate } from '#db/templates.js'
import { resolveBlueprintRoot } from '#utils/blueprint-root.js'
import { evidenceListSchema, canonicalizeEvidenceList } from '#evidence.js'
import {
  checkFreshness,
  readCurrentHead,
  readProjectionMetadata,
  recordProjectionMetadata,
} from '#freshness.js'
import { applyVerification, parseVerificationBlock } from '#verification.js'
import { makeNextAction } from '#next-action.js'
import { PROJECT_SOURCES, resolveBlueprintProjects, type BlueprintProjectRef } from '#projects.js'
import { aggregateBlueprintRows, type ProjectReader } from '#aggregate.js'
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
const PROJECT_RESOLUTION_CACHE_TTL_MS = 15_000
const _recentProjectIndex = new Map<
  string,
  { readonly at: number; readonly project: BlueprintProjectRef }
>()

/**
 * Override the adapter factory — for tests only.
 * Pass `null` to restore the production default.
 *
 * @internal
 */
export function _setSyncAdapterFactory(factory: SyncAdapterFactory | null): void {
  _syncAdapterFactory = factory
}

function readRecentProjectMatch(
  projectId: string,
  resolvedPath: string | null,
): BlueprintProjectRef | null {
  const keys = [projectId]
  if (resolvedPath !== null) keys.push(resolvedPath)

  for (const key of keys) {
    const cached = _recentProjectIndex.get(key)
    if (!cached) continue
    if (Date.now() - cached.at > PROJECT_RESOLUTION_CACHE_TTL_MS) {
      _recentProjectIndex.delete(key)
      continue
    }
    return cached.project
  }

  return null
}

function writeRecentProjectList(cwd: string, projects: readonly BlueprintProjectRef[]): void {
  const at = Date.now()
  for (const project of projects) {
    _recentProjectIndex.set(project.project_id, { at, project })
    _recentProjectIndex.set(project.worktree_path, { at, project })
    _recentProjectIndex.set(project.repo_path, { at, project })
  }
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

const VALIDATE_TS_FILE = '.validate-timestamps.json'
const ROWS_CAP = 200
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const dbPath = (cwd: string) => resolveBlueprintProjectionDbPath(cwd)
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

function parseStructuredJson(result: ToolHandlerResult): Record<string, unknown> {
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent as Record<string, unknown>
  }
  const text = result.content.find((item) => item.type === 'text')
  if (!text || typeof text.text !== 'string') return {}
  try {
    return JSON.parse(text.text) as Record<string, unknown>
  } catch {
    return {}
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
  await withProjectionDbWriteLock(cwd, async () => {
    mkdirSync(path.dirname(target), { recursive: true })
    const conn = openDb(target)
    try {
      await ingestAll({ db: conn.db, cwd })
      recordProjectionMetadata({
        dbPath: target,
        cwd,
        ingestedAt: Date.now(),
      })
    } finally {
      conn.close()
    }
  })
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

async function resolveToolProject(
  cwd: string,
  projectId: string | undefined,
): Promise<{ cwd: string; project_id: string | null } | ToolHandlerResult> {
  if (projectId !== undefined) {
    const resolvedPath = (() => {
      try {
        return realpathSync(projectId)
      } catch {
        return null
      }
    })()

    const cachedMatch = readRecentProjectMatch(projectId, resolvedPath)
    if (cachedMatch) {
      return { cwd: cachedMatch.worktree_path, project_id: cachedMatch.project_id }
    }

    if (resolvedPath !== null) {
      return { cwd: resolvedPath, project_id: null }
    }

    const projects = await resolveBlueprintProjects({ cwd })
    writeRecentProjectList(cwd, projects)

    const match =
      projects.find(
        (project) =>
          project.project_id === projectId ||
          project.worktree_path === projectId ||
          project.repo_path === projectId ||
          (resolvedPath !== null &&
            (project.worktree_path === resolvedPath || project.repo_path === resolvedPath)),
      ) ?? null

    if (match) {
      return { cwd: match.worktree_path, project_id: match.project_id }
    }

    return projectDisambiguationError(
      `Project "${projectId}" not found`,
      'Call wp_blueprint_projects to pick an explicit project_id or pass a valid project path.',
      projects,
    )
  }

  const projects = await resolveBlueprintProjects({ cwd })
  writeRecentProjectList(cwd, projects)

  const current = projects.find((project) => project.source === PROJECT_SOURCES.current) ?? null
  if (current) {
    return { cwd: current.worktree_path, project_id: current.project_id }
  }

  const currentScopeProjects = projects.filter(
    (project) => project.source === PROJECT_SOURCES.recursive_scan,
  )
  if (currentScopeProjects.length === 1) {
    const onlyProject = currentScopeProjects[0]
    if (!onlyProject) {
      return err('project resolution failed', 'Recursive current project selection was empty')
    }
    return { cwd: onlyProject.worktree_path, project_id: onlyProject.project_id }
  }

  if (currentScopeProjects.length > 1) {
    return projectDisambiguationError(
      'Multiple blueprint projects found under the current working directory',
      'Call wp_blueprint_projects and pass an explicit project_id to the blueprint tool you want to run.',
      currentScopeProjects,
    )
  }

  if (projects.length === 1) {
    const onlyProject = projects[0]
    if (!onlyProject) return err('project resolution failed', 'Single project selection was empty')
    return { cwd: onlyProject.worktree_path, project_id: onlyProject.project_id }
  }

  if (projects.length > 1) {
    return projectDisambiguationError(
      'Multiple blueprint projects are visible from the current workspace',
      'Call wp_blueprint_projects and pass an explicit project_id to disambiguate.',
      projects,
    )
  }

  return { cwd, project_id: null }
}

function finishPayload(payload: Record<string, unknown>): ToolHandlerResult {
  payload['bytes'] = bytes(JSON.stringify(payload))
  return jsonContent(payload)
}

type MutationToolName =
  | 'wp_blueprint_create'
  | 'wp_blueprint_task_advance'
  | 'wp_blueprint_task_verify'

type MutationRequestLedgerRow = {
  payload_hash: string
  response_json: string
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    const out: Record<string, unknown> = {}
    for (const [key, nested] of entries) out[key] = sortKeys(nested)
    return out
  }
  return value
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
  if (!p.success) return err('wp_blueprint_query validation error', p.error.message)
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
async function handleTaskNext(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = taskNextSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_task_next validation error', p.error.message)
  const { blueprint, project_id } = p.data
  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  const failures: string[] = []

  // Platform-first: refresh local replica before reading so the result reflects remote state.
  // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(projectCwd)
  if (adapter !== null) {
    const timeoutMs = Math.max(
      1,
      Number.parseInt(process.env['AK_BLUEPRINT_READ_FRESH_TIMEOUT_MS'] ?? '5000', 10) || 5000,
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
async function handleTaskAdvance(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = advanceSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_task_advance validation error', p.error.message)
  const { project_id, task_id, to, request_id, head_at_ingest } = p.data
  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
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
    // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
    const adapter = await resolveSyncAdapter(projectCwd)
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

async function handleTaskVerify(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = taskVerifySchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_task_verify validation error', p.error.message)
  const { project_id, slug, task_id, evidence, request_id, head_at_ingest } = p.data
  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
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
  const filePath = path.join(found.dir, '_overview.md')
  if (!existsSync(filePath)) {
    return err('wp_blueprint_task_verify failed', `Blueprint overview not found at ${filePath}`)
  }

  const markdownBefore = readFileSync(filePath, 'utf8')

  // Idempotency check: if the task already has the same canonical evidence block, skip write.
  // We check this BEFORE calling applyVerification to avoid whitespace normalization drift
  // making `result.markdown !== markdownBefore` always true even for identical evidence.
  const incomingCanonical = canonicalizeEvidenceList(evidence)
  const existingEvidence = parseVerificationBlock(markdownBefore)
  if (
    existingEvidence !== null &&
    canonicalizeEvidenceList(existingEvidence) === incomingCanonical
  ) {
    const nextPayload = parseStructuredJson(
      await handleTaskNext(projectCwd, {
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
    await handleTaskNext(projectCwd, {
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
async function handlePromote(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = promoteSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_promote validation error', p.error.message)
  const { project_id, slug, to_state } = p.data
  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
  const root = resolveBlueprintRoot(projectCwd)
  const found = findBlueprintDir(root, slug, ALL_STATES)
  if (!found)
    return err(
      'wp_blueprint_promote failed',
      `Blueprint "${slug}" not found in any state directory`,
    )
  const { dir: currentDir, state: currentState } = found
  const overviewPath = path.join(currentDir, '_overview.md')
  const ts = readVt(projectCwd)
  const mtime = existsSync(overviewPath) ? statSync(overviewPath).mtimeMs : 0
  if ((ts[slug] ?? 0) < mtime)
    return err(
      'wp_blueprint_promote refused',
      `Blueprint "${slug}" not validated since last write. Run wp_blueprint_validate first.`,
    )
  // Platform-first path: push event + pull fresh replica before local move.
  // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(projectCwd)
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
    return err('wp_blueprint_promote failed', `Directory move error: ${toStr(e)}`)
  }
  const destOverview = path.join(destDir, '_overview.md')
  if (existsSync(destOverview)) {
    const fm = matter(readFileSync(destOverview, 'utf8'))
    fm.data['status'] = to_state
    writeFileSync(destOverview, matter.stringify(fm.content, fm.data), 'utf8')
  }
  try {
    await reIngest(projectCwd)
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
  if (currentState === 'draft' && to_state === 'planned')
    appendHint(payload, projectCwd, 'PLAN_REFINE')
  return finishPayload(payload)
}

const finalizeSchema = z.object({ project_id: z.string().optional(), slug: z.string() })
async function handleFinalize(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = finalizeSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_finalize validation error', p.error.message)
  const { project_id, slug } = p.data
  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
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

  // Platform-first path: push event + pull fresh replica before local move.
  // Iron rule: resolveSyncAdapter() returns null when AK_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapter(projectCwd)
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
    return err('wp_blueprint_finalize failed', `Directory move error: ${toStr(e)}`)
  }
  const destOverview = path.join(destDir, '_overview.md')
  if (existsSync(destOverview)) {
    const fm = matter(readFileSync(destOverview, 'utf8'))
    fm.data['status'] = 'completed'
    fm.data['completed_at'] = new Date().toISOString().split('T')[0] ?? ''
    writeFileSync(destOverview, matter.stringify(fm.content, fm.data), 'utf8')
  }
  try {
    await reIngest(projectCwd)
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
  if (hasRecentAuditFinding(projectCwd)) appendHint(payload, projectCwd, 'AUDIT_FIX')
  return finishPayload(payload)
}

const depgraphSchema = z.object({ from: z.string() })
async function handleDepgraph(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = depgraphSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_depgraph validation error', p.error.message)
  const { from } = p.data
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

async function handleBlueprintList(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = listSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_list validation error', p.error.message)
  const { status, limit, scope, project_id } = p.data

  // Multi-project path: scope is 'roots', 'workspace', or 'all'
  const isMultiScope = scope === 'roots' || scope === 'workspace' || scope === 'all'

  if (isMultiScope) {
    try {
      const target: { scope: typeof scope; project_id?: string } = { scope }
      if (project_id) target.project_id = project_id

      const result = await aggregateBlueprintRows<BpRow>({
        target,
        read: listBpReader,
        resolveOptions: { cwd },
      })

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
  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
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

async function handleBlueprintGet(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = getSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_get validation error', p.error.message)
  const { slug, scope, project_id } = p.data

  const isMultiScope = scope === 'roots' || scope === 'workspace' || scope === 'all'

  if (isMultiScope) {
    try {
      const readTarget: { scope: typeof scope; project_id?: string } = { scope }
      if (project_id) readTarget.project_id = project_id

      const result = await aggregateBlueprintRows<BpDetailRow>({
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
      })

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
  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
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

async function handleBlueprintContext(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = contextSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_context validation error', p.error.message)
  const { slug, task_id, project_id } = p.data

  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
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

async function handleBlueprintCreate(cwd: string, raw: unknown): Promise<ToolHandlerResult> {
  const p = createSchema.safeParse(raw)
  if (!p.success) return err('wp_blueprint_create validation error', p.error.message)
  const { project_id, title, goal, complexity, tags, request_id, head_at_ingest } = p.data
  const resolvedProject = await resolveToolProject(cwd, project_id)
  if ('content' in resolvedProject) return resolvedProject
  const projectCwd = resolvedProject.cwd
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
  const targetDir = path.join(root, 'draft', slug)
  const overviewPath = path.join(targetDir, '_overview.md')

  try {
    mkdirSync(targetDir, { recursive: true })
    const content = BLUEPRINT_TEMPLATE.replace(/{TITLE}/g, title)
      .replace(/{COMPLEXITY}/g, complexity)
      .replace(/{DATE}/g, today)
      .replace('{GOAL}', goal)
    writeFileSync(overviewPath, content, 'utf8')

    // Re-ingest so the DB reflects the new blueprint
    await reIngest(projectCwd)

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

const nextActionOutputSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string' },
    hint: { type: 'string' },
  },
  required: ['kind', 'hint'],
} as const

const summaryEnvelopeOutputSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    failures: { type: 'array', items: { type: 'string' } },
    bytes: { type: 'number' },
    tokensSaved: { type: 'number' },
  },
  required: ['summary', 'failures', 'bytes', 'tokensSaved'],
} as const

export async function registerBlueprintTools(registrar: ToolRegistrar, cwd: string): Promise<void> {
  const coldStart = await coldStartIfNeeded(cwd)
  if (!coldStart.rebuilt) {
    await reIngest(cwd)
  }

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
    'wp_blueprint_validate',
    'Validate _overview.md structure. Returns { valid, gaps }. Must pass before wp_blueprint_promote.',
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
    (r) => handleTaskNext(cwd, r),
    { title: 'Blueprint Task Next', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_task_advance',
    'Advance task status. Edits _overview.md and re-syncs DB. Accepts optional request_id for idempotent retries and optional head_at_ingest from wp_blueprint_get/wp_blueprint_list to reject stale writes. Returns { summary, old_status, new_status, idempotent }.',
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
    (r) => handleTaskAdvance(cwd, r),
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
    (r) => handlePromote(cwd, r),
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
    (r) => handleFinalize(cwd, r),
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
    (r) => handleBlueprintList(cwd, r),
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
    (r) => handleBlueprintGet(cwd, r),
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
    (r) => handleBlueprintContext(cwd, r),
    { title: 'Blueprint Context', readOnlyHint: true, openWorldHint: false },
  )

  registrar.registerTool(
    'wp_blueprint_create',
    'Create a new blueprint markdown under blueprints/draft/<slug>/_overview.md and re-ingest. Accepts optional request_id for idempotent retries and optional head_at_ingest from wp_blueprint_projects/wp_blueprint_list to reject stale writes. Returns { slug, path, next_action, idempotent }.',
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
    (r) => handleBlueprintCreate(cwd, r),
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
    (r) => handleTaskVerify(cwd, r),
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
  await registerBlueprintTools(registrar, cwd)

  // Cached snapshot of the MCP client's roots, invalidated by list-changed.
  interface RootsCacheState {
    fetched: boolean
    roots: ReadonlyArray<{ readonly uri: string; readonly name?: string }>
    unsupported: boolean
  }
  const cache: RootsCacheState = { fetched: false, roots: [], unsupported: false }

  async function ensureRoots(): Promise<RootsCacheState> {
    if (cache.fetched) return cache
    if (!options.getMcpRoots) {
      cache.fetched = true
      cache.roots = []
      cache.unsupported = false
      return cache
    }
    try {
      const response = await options.getMcpRoots()
      cache.fetched = true
      cache.roots = response.roots
      cache.unsupported = false
    } catch {
      // Roots capability missing on the client — degrade gracefully.
      cache.fetched = true
      cache.roots = []
      cache.unsupported = true
    }
    return cache
  }

  if (options.onRootsListChanged) {
    options.onRootsListChanged(() => {
      cache.fetched = false
      cache.roots = []
      cache.unsupported = false
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
    async (input) => handleProjects(cwd, ensureRoots, input),
    { title: 'Blueprint Projects', readOnlyHint: true, openWorldHint: false },
  )
}

async function handleProjects(
  cwd: string,
  ensureRoots: () => Promise<{
    fetched: boolean
    roots: ReadonlyArray<{ readonly uri: string; readonly name?: string }>
    unsupported: boolean
  }>,
  raw: unknown,
): Promise<ToolHandlerResult> {
  const scopeSchema = z.object({
    scope: z.enum(['current', 'roots', 'workspace', 'all']).optional(),
  })
  const parsed = scopeSchema.safeParse(raw)
  const rootsState = await ensureRoots()

  const projects = await resolveBlueprintProjects({
    cwd,
    rootsProvider:
      rootsState.roots.length > 0 ? async () => ({ roots: rootsState.roots }) : undefined,
  })
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

  const summary =
    filteredProjects.length === 0
      ? 'No blueprint-bearing projects found'
      : `Found ${filteredProjects.length} project${filteredProjects.length === 1 ? '' : 's'}`

  const payload: Record<string, unknown> = {
    summary,
    projects: filteredProjects,
    warnings,
  }
  writeRecentProjectList(cwd, projects)

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
