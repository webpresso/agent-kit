#!/usr/bin/env bun
/**
 * SessionStart hook: injects WP_ROUTING_BLOCK and optionally `.agent/routing.md`
 * into Claude Code sessions.
 *
 * Wired in `plugin.json` as `SessionStart` with matcher `startup|resume|compact`.
 * The `compact` source is included so the routing block is re-injected after
 * context compaction (F3 from fact-check: block is silently dropped without it).
 * Cannot block (decision-control unsupported for SessionStart) — this is
 * observability + context injection only. Latency budget: <750ms release resume-injection budget.
 *
 * Output contract (per Claude Code hooks docs):
 *   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<contents>"}}
 *
 * Always emits — never returns null. WP_ROUTING_BLOCK is always prepended.
 * If `.agent/routing.md` exists and is non-empty, it is appended after the block.
 */
import { readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { join } from 'node:path'

import { WP_ROUTING_BLOCK } from '#hooks/shared/routing-block'
import { renderSessionStartInstructionContext } from '#hooks/shared/instruction-surfaces'
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'
import { Database } from '#db/sqlite.js'

import { readUpdateBanner } from './update-banner.js'
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint'
import { repoHashFromRoot } from '#session-memory/repo-hash.js'

export { WP_ROUTING_BLOCK }
export const MAX_BYTES = 200 * 1024
export const TRUNCATION_NOTICE = '\n\n[truncated: file exceeded 200KB limit]'
export const RESUME_MAX_EVENT_BYTES = 2 * 1024
export const RESUME_MAX_BYTES = 16 * 1024
export const RESUME_CAP_MS = 750
export const RESUME_MIN_PRIORITY = 50

type StartInput = Record<string, unknown>
type EnvLike = Record<string, string | undefined>
type SessionStartSource = 'startup' | 'resume' | 'compact'

export interface SessionStartDeps {
  readonly createDatabase?: (dbPath: string) => Pick<Database, 'prepare' | 'close'>
  readonly dbPath?: string
  readonly repoHash?: (projectDir: string) => string
}

type SessionEventRow = {
  readonly session_id: string
  readonly event_id: string
  readonly ts: string
  readonly event_type: string
  readonly tool_name: string
  readonly content: string
  readonly summary: string | null
  readonly priority: number
  readonly metadata_json: string
}

type ResumeEventEnvelope = {
  readonly sessionId: string
  readonly eventId: string
  readonly ts: string
  readonly eventType: string
  readonly toolName: string
  readonly content: string
  readonly summary?: string
  readonly priority: number
  readonly metadata: Record<string, unknown>
}

const SECRET_PATTERN =
  /\b([A-Z0-9_]*(?:api[_-]?key|password|secret|token)[A-Z0-9_]*)\b\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/giu
const BEARER_PATTERN = /(?:(\bauthorization\b)\s*:\s*)?\bbearer\s+[^\s,;]+/giu
const SENSITIVE_METADATA_KEY_PATTERN =
  /(?:api[_-]?key|auth(?:orization)?|bearer|password|secret|token)/iu

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function sessionStartSource(input: StartInput): SessionStartSource {
  const value = input['source'] ?? input['session_start_source']
  return value === 'resume' || value === 'compact' || value === 'startup' ? value : 'startup'
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (byteLength(value) <= maxBytes) return { value, truncated: false }
  let bytes = 0
  let output = ''
  for (const char of value) {
    const charBytes = byteLength(char)
    if (bytes + charBytes > maxBytes) break
    output += char
    bytes += charBytes
  }
  return { value: output, truncated: true }
}

function sanitizeContinuityText(value: string): { value: string; redacted: boolean } {
  let redacted = false
  const withoutBearer = value.replace(BEARER_PATTERN, (_match, label: string | undefined) => {
    redacted = true
    return label ? `${label}: Bearer [REDACTED]` : 'Bearer [REDACTED]'
  })
  const withoutSecrets = withoutBearer.replace(SECRET_PATTERN, (_match, label: string) => {
    redacted = true
    return `${label}=[REDACTED]`
  })
  return {
    value: withoutSecrets.replaceAll('</wp_session_continuity>', '<\\/wp_session_continuity>'),
    redacted,
  }
}

function sanitizeMetadataValue(
  value: unknown,
  keyHint = '',
): { value: unknown; redacted: boolean } {
  if (typeof value === 'string') {
    if (SENSITIVE_METADATA_KEY_PATTERN.test(keyHint)) return { value: '[REDACTED]', redacted: true }
    return sanitizeContinuityText(value)
  }
  if (Array.isArray(value)) {
    let redacted = false
    const next = value.map((item) => {
      const sanitized = sanitizeMetadataValue(item, keyHint)
      redacted = redacted || sanitized.redacted
      return sanitized.value
    })
    return { value: next, redacted }
  }
  if (value && typeof value === 'object') {
    let redacted = false
    const next: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeMetadataValue(nested, key)
      redacted = redacted || sanitized.redacted
      next[key] = sanitized.value
    }
    return { value: next, redacted }
  }
  return { value, redacted: false }
}

function parseMetadata(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Corrupt metadata should not block SessionStart.
  }
  return {}
}

function eventToEnvelope(row: SessionEventRow, maxEventBytes: number): ResumeEventEnvelope {
  const sanitizedContent = sanitizeContinuityText(row.content)
  const content = truncateUtf8(sanitizedContent.value, maxEventBytes)
  const sanitizedSummary = row.summary ? sanitizeContinuityText(row.summary) : null
  const sanitizedMetadata = sanitizeMetadataValue(parseMetadata(row.metadata_json))
  const metadata = sanitizedMetadata.value as Record<string, unknown>
  if (content.truncated) metadata.truncated = true
  if (sanitizedContent.redacted || sanitizedSummary?.redacted || sanitizedMetadata.redacted) {
    metadata.redacted = true
  }
  return {
    sessionId: row.session_id,
    eventId: row.event_id,
    ts: row.ts,
    eventType: row.event_type,
    toolName: row.tool_name,
    content: content.value,
    ...(sanitizedSummary ? { summary: sanitizedSummary.value } : {}),
    priority: row.priority,
    metadata,
  }
}

function readRecentContinuityEvents(input: {
  readonly db: Pick<Database, 'prepare'>
  readonly repoHash: string
  readonly sessionId?: string
  readonly minPriority: number
  readonly limit: number
}): SessionEventRow[] {
  if (input.sessionId) {
    return input.db
      .prepare<[string, string, number, number], SessionEventRow>(
        `SELECT session_id, event_id, ts, event_type, tool_name, content, summary, priority, metadata_json
         FROM session_events
         WHERE repo_hash = ? AND session_id = ? AND priority >= ?
         ORDER BY priority DESC, ts DESC, event_id ASC
         LIMIT ?`,
      )
      .all(input.repoHash, input.sessionId, input.minPriority, input.limit)
  }
  return input.db
    .prepare<[string, number, number], SessionEventRow>(
      `SELECT session_id, event_id, ts, event_type, tool_name, content, summary, priority, metadata_json
       FROM session_events
       WHERE repo_hash = ? AND priority >= ?
       ORDER BY priority DESC, ts DESC, event_id ASC
       LIMIT ?`,
    )
    .all(input.repoHash, input.minPriority, input.limit)
}

function renderResumeEvents(
  rows: readonly SessionEventRow[],
  maxEventBytes: number,
  maxBytes: number,
): {
  readonly content: string
  readonly status: 'complete' | 'partial'
  readonly eventCount: number
} {
  const lines: string[] = []
  let usedBytes = 0
  for (const row of rows) {
    const line = JSON.stringify(eventToEnvelope(row, maxEventBytes))
    const lineBytes = byteLength(line) + (lines.length > 0 ? 1 : 0)
    if (usedBytes + lineBytes > maxBytes) {
      return { content: lines.join('\n'), status: 'partial', eventCount: lines.length }
    }
    lines.push(line)
    usedBytes += lineBytes
  }
  return { content: lines.join('\n'), status: 'complete', eventCount: lines.length }
}

export function resolveSessionMemoryDbPath(projectDir: string, env: EnvLike): string {
  if (env.WP_SESSION_MEMORY_DB && env.WP_SESSION_MEMORY_DB.length > 0)
    return env.WP_SESSION_MEMORY_DB
  if (env.WP_SESSION_MEMORY_DIR && env.WP_SESSION_MEMORY_DIR.length > 0) {
    return join(env.WP_SESSION_MEMORY_DIR, 'sessions.sqlite')
  }
  try {
    return getSurfacePath('session-memory/sessions.sqlite', 'worktree', projectDir)
  } catch (error) {
    if (
      !(error instanceof NotInGitRepoError) &&
      (error as { name?: string }).name !== 'NotInGitRepoError'
    ) {
      throw error
    }
    return join(
      tmpdir(),
      'webpresso-session-memory',
      repoHashFromRoot(projectDir),
      'sessions.sqlite',
    )
  }
}

function buildResumeContext(
  input: StartInput,
  projectDir: string,
  env: EnvLike,
  deps: SessionStartDeps,
): string | null {
  const resumeCapMs = parsePositiveInt(env.WP_SESSIONSTART_RESUME_CAP_MS, RESUME_CAP_MS)
  const deadline = performance.now() + resumeCapMs
  const overResumeBudget = (): boolean => performance.now() > deadline

  try {
    if (overResumeBudget()) return null
    const dbPath = deps.dbPath ?? resolveSessionMemoryDbPath(projectDir, env)
    const db = deps.createDatabase?.(dbPath) ?? new Database(dbPath, { readonly: true })
    try {
      if (overResumeBudget()) return null
      const repoHash = deps.repoHash?.(projectDir) ?? repoHashFromRoot(projectDir)
      if (overResumeBudget()) return null
      const source = sessionStartSource(input)
      const maxEventBytes = parsePositiveInt(
        env.WP_SESSIONSTART_RESUME_MAX_EVENT_BYTES,
        RESUME_MAX_EVENT_BYTES,
      )
      const maxSnapshotBytes = parsePositiveInt(
        env.WP_SESSIONSTART_RESUME_MAX_BYTES,
        RESUME_MAX_BYTES,
      )
      const rows = readRecentContinuityEvents({
        db,
        repoHash,
        sessionId: optionalString(input['session_id']),
        minPriority: parsePositiveInt(env.WP_SESSIONSTART_RESUME_MIN_PRIORITY, RESUME_MIN_PRIORITY),
        limit: parsePositiveInt(env.WP_SESSIONSTART_RESUME_MAX_EVENTS, 16),
      })
      if (overResumeBudget()) return null
      const snapshot = renderResumeEvents(rows, maxEventBytes, maxSnapshotBytes)
      if (snapshot.eventCount === 0 || snapshot.content.length === 0) return null
      return [
        `<wp_session_continuity source="${source}" status="${snapshot.status}" events="${snapshot.eventCount}">`,
        snapshot.content,
        '</wp_session_continuity>',
      ].join('\n')
    } finally {
      db.close()
    }
  } catch (error) {
    if (env.WP_SESSIONSTART_DEBUG === '1') {
      process.stderr.write(`wp-sessionstart-resume: ${(error as Error).message}\n`)
    }
    // SessionStart must remain context-safe: continuity storage is advisory.
    return null
  }
}

/**
 * Pure function: given a parsed input payload, a working directory, and
 * environment variables, produce the JSON string that the hook should write
 * to stdout. Always emits — never returns null. WP_ROUTING_BLOCK is always
 * prepended; `.agent/routing.md` content is appended when present and non-empty.
 */
export function buildOutput(
  input: StartInput,
  cwd: string,
  env: EnvLike,
  deps: SessionStartDeps = {},
): string {
  const projectDir =
    env.CLAUDE_PROJECT_DIR && env.CLAUDE_PROJECT_DIR.length > 0 ? env.CLAUDE_PROJECT_DIR : cwd
  const target = join(projectDir, '.agent', 'routing.md')

  let routingMd: string | null = null
  try {
    const stat = statSync(target)
    if (stat.isFile() && stat.size > 0) {
      const raw = readFileSync(target, 'utf-8')
      if (raw.length > 0) {
        let content = raw
        if (Buffer.byteLength(raw, 'utf-8') > MAX_BYTES) {
          // Slice on UTF-16 code units; routing.md is ASCII-dominant in practice.
          content = raw.slice(0, MAX_BYTES) + TRUNCATION_NOTICE
        }
        routingMd = content
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      // Permission or other read errors: surface to stderr but continue.
      process.stderr.write(
        `wp-sessionstart-routing: failed to read ${target}: ${(err as Error).message}\n`,
      )
    }
    // ENOENT / ENOTDIR: no routing.md, that's fine — emit routing block alone.
  }

  const resumeContext = buildResumeContext(input, projectDir, env, deps)
  const updateBanner = readUpdateBanner(env as NodeJS.ProcessEnv)
  const additionalContext = renderSessionStartInstructionContext({
    projectRoutingMarkdown: routingMd,
    extraSections: [resumeContext, updateBanner],
  })

  const finalContext = truncateUtf8(additionalContext, MAX_BYTES)
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: finalContext.truncated
        ? finalContext.value + TRUNCATION_NOTICE
        : finalContext.value,
    },
  })
}

async function readStdin(): Promise<StartInput> {
  if (process.stdin.isTTY) return {}
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      const text = Buffer.concat(chunks).toString('utf-8').trim()
      if (text.length === 0) return resolve({})
      try {
        resolve(JSON.parse(text) as StartInput)
      } catch {
        resolve({})
      }
    }
    process.stdin.on('data', (c: Buffer) => chunks.push(c))
    process.stdin.on('end', finish)
    process.stdin.on('error', finish)
  })
}

export async function main(): Promise<void> {
  try {
    const input = await readStdin()
    const out = buildOutput(input, process.cwd(), process.env)
    process.stdout.write(out)
  } catch (err) {
    process.stderr.write(`wp-sessionstart-routing: ${(err as Error).message}\n`)
  }
  process.exit(0)
}

if (isDirectEntrypoint(import.meta.url)) {
  void main()
}
