import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

import type { ToolInput } from '#hooks/shared/types'
import { buildContinuityEvent } from '#session-memory/hook-capture.js'
import { repoHashFromRoot } from '#session-memory/repo-hash.js'
import { SessionMemorySessionStore } from '#session-memory/session.js'

import type { PostToolCaptureDeps } from './lint-after-edit.js'
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'
import { buildPostToolBatchSummary } from './batch-summary.js'

type EnvLike = Record<string, string | undefined>

const DEFAULT_MAX_CAPTURE_BYTES = 2048

function resolveSessionMemoryDbPath(projectDir: string, env: EnvLike = process.env): string {
  if (env.WP_SESSION_MEMORY_DB && env.WP_SESSION_MEMORY_DB.length > 0) return env.WP_SESSION_MEMORY_DB
  if (env.WP_SESSION_MEMORY_DIR && env.WP_SESSION_MEMORY_DIR.length > 0) {
    return join(env.WP_SESSION_MEMORY_DIR, 'sessions.sqlite')
  }
  try {
    return getSurfacePath('session-memory/sessions.sqlite', 'worktree', projectDir)
  } catch (error) {
    if (!(error instanceof NotInGitRepoError)) throw error
    return join(tmpdir(), 'webpresso-session-memory', repoHashFromRoot(projectDir), 'sessions.sqlite')
  }
}

export function capturePostToolBatch(
  input: ToolInput,
  projectDir: string,
  env: EnvLike = process.env,
  deps: PostToolCaptureDeps = {},
): boolean {
  if (input.hook_event_name !== 'PostToolBatch') return false

  try {
    const summary = buildPostToolBatchSummary(input)
    const dbPath = deps.dbPath ?? resolveSessionMemoryDbPath(projectDir, env)
    mkdirSync(dirname(dbPath), { recursive: true })
    const store = deps.createStore?.(dbPath) ?? new SessionMemorySessionStore(dbPath)
    try {
      const repoHash = deps.repoHash?.(projectDir) ?? repoHashFromRoot(projectDir)
      const content = [
        `PostToolBatch: ${summary.successCount} succeeded, ${summary.failureCount} failed, ${summary.totalResultBytes} result bytes`,
        summary.preview,
      ]
        .filter(Boolean)
        .join('\n')
      const event = buildContinuityEvent({
        eventType: 'assistant_turn_summary',
        toolName: input.tool_name ?? 'PostToolBatch',
        content,
        summary: `PostToolBatch: ${summary.successCount} succeeded, ${summary.failureCount} failed`,
        priority: summary.failureCount > 0 ? 65 : 55,
        metadata: {
          source: 'post-tool-batch-hook',
          hookEventName: input.hook_event_name,
          transcriptPath: input.transcript_path,
          cwd: input.cwd ?? projectDir,
          toolNames: summary.toolNames,
          successCount: summary.successCount,
          failureCount: summary.failureCount,
          totalResultBytes: summary.totalResultBytes,
          truncated: summary.truncated,
        },
        maxContentBytes: DEFAULT_MAX_CAPTURE_BYTES,
      })
      store.captureEvent({
        repoHash,
        agentId: input.tool_name ?? 'default',
        ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
        event: { ...event, ts: (deps.now?.() ?? new Date()).toISOString() },
      })
      return true
    } finally {
      store.close()
    }
  } catch {
    return false
  }
}
