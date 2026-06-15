#!/usr/bin/env bun
import type { ToolInput } from '#hooks/shared/types'

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { runHook } from '#hooks/shared/hook-bootstrap'
import {
  getCommand,
  getContent,
  getFilePath,
  isBashInput,
  isFileEditInput,
  isFileReadInput,
  isFileWriteInput,
} from '#hooks/shared/types'
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint'
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'
import { buildContinuityEvent } from '#session-memory/hook-capture.js'
import { repoHashFromRoot } from '#session-memory/repo-hash.js'
import { SessionMemorySessionStore } from '#session-memory/session.js'
import type { SessionContinuityEventType } from '#session-memory/types.js'

export const LINTABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css'] as const
export const DEFAULT_MAX_CAPTURE_BYTES = 2048

type EnvLike = Record<string, string | undefined>

export interface PostToolCaptureDeps {
  readonly createStore?: (
    dbPath: string,
  ) => Pick<SessionMemorySessionStore, 'captureEvent' | 'close'>
  readonly dbPath?: string
  readonly now?: () => Date
  readonly repoHash?: (projectDir: string) => string
}

export const SKIP_PATTERNS: readonly RegExp[] = [
  /\/node_modules\//,
  /\/dist\//,
  /\/.next\//,
  /\/generated\//,
  /\/worker-configuration\.d\.ts$/,
]

export function isLintableFile(filePath: string): boolean {
  return (LINTABLE_EXTENSIONS as readonly string[]).includes(extname(filePath))
}

export function isSkippedPath(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath))
}

export function shouldLintFile(input: ToolInput): boolean {
  const filePath = getFilePath(input)
  if (!filePath) return false
  if (!isLintableFile(filePath)) return false
  if (isSkippedPath(filePath)) return false
  return true
}

/**
 * Hot-path stub.
 *
 * `PostToolUse` fires for every eligible edit/write, so broad shell-outs here
 * add latency on the critical path. Until the deferred execution plane exists,
 * the hook only classifies that a file would have been lint-eligible.
 */
export function lintFile(filePath: string, _projectDir: string): boolean {
  if (!existsSync(filePath)) return false
  return true
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

function capUtf8Bytes(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) return value
  let bytes = 0
  let capped = ''
  for (const char of value) {
    const charBytes = byteLength(char)
    if (bytes + charBytes > maxBytes) break
    capped += char
    bytes += charBytes
  }
  return capped
}

function postToolEventType(input: ToolInput): SessionContinuityEventType | null {
  if (isFileReadInput(input)) return 'tool_read'
  if (isFileWriteInput(input) || isFileEditInput(input)) return 'tool_edit'
  if (isBashInput(input)) return 'tool_command'
  return null
}

function describePostToolUse(input: ToolInput): string | null {
  const toolName = input.tool_name ?? 'unknown'
  const filePath = getFilePath(input)
  if (filePath) {
    const content = getContent(input)
    const byteSuffix = content === undefined ? '' : ` (${byteLength(content)} input bytes)`
    return `${toolName} ${filePath}${byteSuffix}`
  }
  const command = getCommand(input)
  if (command) return `${toolName} command: ${capUtf8Bytes(collapseWhitespace(command), 320)}`
  return null
}

export function resolveSessionMemoryDbPath(projectDir: string, env: EnvLike = process.env): string {
  if (env.WP_SESSION_MEMORY_DB && env.WP_SESSION_MEMORY_DB.length > 0)
    return env.WP_SESSION_MEMORY_DB
  if (env.WP_SESSION_MEMORY_DIR && env.WP_SESSION_MEMORY_DIR.length > 0) {
    return join(env.WP_SESSION_MEMORY_DIR, 'sessions.sqlite')
  }
  try {
    return getSurfacePath('session-memory/sessions.sqlite', 'worktree', projectDir)
  } catch (error) {
    if (!(error instanceof NotInGitRepoError)) throw error
    return join(
      tmpdir(),
      'webpresso-session-memory',
      repoHashFromRoot(projectDir),
      'sessions.sqlite',
    )
  }
}

export function capturePostToolUse(
  input: ToolInput,
  projectDir: string,
  env: EnvLike = process.env,
  deps: PostToolCaptureDeps = {},
): boolean {
  const eventType = postToolEventType(input)
  const description = describePostToolUse(input)
  if (eventType === null || description === null) return false

  try {
    const dbPath = deps.dbPath ?? resolveSessionMemoryDbPath(projectDir, env)
    mkdirSync(dirname(dbPath), { recursive: true })
    const store = deps.createStore?.(dbPath) ?? new SessionMemorySessionStore(dbPath)
    try {
      const repoHash = deps.repoHash?.(projectDir) ?? repoHashFromRoot(projectDir)
      const event = buildContinuityEvent({
        eventType,
        toolName: input.tool_name ?? 'PostToolUse',
        content: description,
        summary: description,
        priority: eventType === 'tool_read' ? 45 : 60,
        metadata: {
          source: 'post-tool-hook',
          hookEventName: input.hook_event_name ?? 'PostToolUse',
          transcriptPath: input.transcript_path,
          cwd: input.cwd ?? projectDir,
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

export function processPostToolUse(
  input: ToolInput,
  projectDir: string,
  env: EnvLike = process.env,
  deps: PostToolCaptureDeps = {},
): boolean {
  capturePostToolUse(input, projectDir, env, deps)
  if (!shouldLintFile(input)) return false
  const toolInput = input.tool_input
  if (!toolInput || typeof toolInput.file_path !== 'string') return false
  const filePath = toolInput.file_path
  return lintFile(filePath, projectDir)
}

export async function main(): Promise<void> {
  await runHook(
    (input) => {
      const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
      processPostToolUse(input as ToolInput, projectDir)
      return null
    },
    () => '{}',
  )
}

if (isDirectEntrypoint(import.meta.url)) {
  void main()
}
