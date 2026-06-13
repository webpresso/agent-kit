#!/usr/bin/env bun
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint'
import { runHook } from '#hooks/shared/hook-bootstrap'
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js'
import { buildPromptContinuityEvents } from '#session-memory/hook-capture.js'
import { repoHashFromRoot } from '#session-memory/repo-hash.js'
import { SessionMemorySessionStore } from '#session-memory/session.js'
import { setGuardEnabled } from './state.js'

type EnvLike = Record<string, string | undefined>

type GuardSwitchInput = {
  readonly agent_id?: string
  readonly agent_type?: string
  readonly cwd?: string
  readonly hook_event_name?: string
  readonly prompt?: string
  readonly session_id?: string
  readonly transcript_path?: string | null
  readonly turn_id?: string
}

export type GuardSwitchResult = Record<string, never> | { exitCode: 2; stderr: string }

export interface GuardSwitchDeps {
  readonly createStore?: (
    dbPath: string,
  ) => Pick<SessionMemorySessionStore, 'captureEvent' | 'close'>
  readonly dbPath?: string
  readonly now?: () => Date
  readonly repoHash?: (projectDir: string) => string
  readonly setGuardEnabled?: (enabled: boolean) => void
}

export const DEFAULT_MAX_PROMPT_CAPTURE_BYTES = 2048

const SECRET_PATTERN =
  /\b(api[_-]?key|auth(?:orization)?|bearer|password|secret|token)\b\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/giu

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeInput(input: unknown): GuardSwitchInput {
  return isRecord(input) ? (input as GuardSwitchInput) : {}
}

function projectDirFor(input: GuardSwitchInput, cwd: string, env: EnvLike): string {
  if (env.CLAUDE_PROJECT_DIR && env.CLAUDE_PROJECT_DIR.length > 0) return env.CLAUDE_PROJECT_DIR
  if (typeof input.cwd === 'string' && input.cwd.length > 0) return input.cwd
  return cwd
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

function redactPrompt(prompt: string): { prompt: string; redacted: boolean } {
  let redacted = false
  const value = prompt.replace(SECRET_PATTERN, (_match, label: string) => {
    redacted = true
    return `${label}=[REDACTED]`
  })
  return { prompt: value, redacted }
}

function capturePromptContinuity(
  input: GuardSwitchInput,
  projectDir: string,
  env: EnvLike,
  deps: GuardSwitchDeps,
): void {
  const rawPrompt = typeof input.prompt === 'string' ? input.prompt : ''
  const { prompt, redacted } = redactPrompt(rawPrompt)
  const events = buildPromptContinuityEvents({
    prompt,
    maxContentBytes: DEFAULT_MAX_PROMPT_CAPTURE_BYTES,
  })
  if (events.length === 0) return

  const dbPath = deps.dbPath ?? resolveSessionMemoryDbPath(projectDir, env)
  mkdirSync(dirname(dbPath), { recursive: true })
  const store = deps.createStore?.(dbPath) ?? new SessionMemorySessionStore(dbPath)
  try {
    const repoHash = deps.repoHash?.(projectDir) ?? repoHashFromRoot(projectDir)
    const timestamp = (deps.now?.() ?? new Date()).toISOString()
    for (const event of events) {
      store.captureEvent({
        repoHash,
        agentId: input.agent_id ?? input.agent_type ?? 'UserPromptSubmit',
        ...(input.session_id === undefined ? {} : { sessionId: input.session_id }),
        event: {
          ...event,
          ts: timestamp,
          metadata: {
            ...event.metadata,
            source: 'user-prompt-hook',
            hookEventName: input.hook_event_name ?? 'UserPromptSubmit',
            transcriptPath: input.transcript_path ?? undefined,
            turnId: input.turn_id ?? undefined,
            ...(redacted ? { redacted: true } : {}),
          },
        },
      })
    }
  } finally {
    store.close()
  }
}

export function processGuardSwitchInput(
  inputValue: unknown,
  cwd: string,
  env: EnvLike = process.env,
  deps: GuardSwitchDeps = {},
): GuardSwitchResult {
  const input = normalizeInput(inputValue)
  const normalized = (input.prompt ?? '').toLowerCase().trim()
  const setEnabled = deps.setGuardEnabled ?? setGuardEnabled
  if (normalized === 'guard off') {
    setEnabled(false)
    return { exitCode: 2, stderr: '🛡️ Guard disabled — pretool validators will be skipped' }
  }
  if (normalized === 'guard on') {
    setEnabled(true)
    return { exitCode: 2, stderr: '🛡️ Guard enabled — pretool validators active' }
  }

  try {
    capturePromptContinuity(input, projectDirFor(input, cwd, env), env, deps)
  } catch {
    // UserPromptSubmit must stay host-safe: storage failures or malformed inputs are no-ops.
  }
  return {}
}

export async function main(): Promise<void> {
  await runHook(
    (input) => {
      const result = processGuardSwitchInput(input, process.cwd(), process.env)
      if ('exitCode' in result) {
        console.error(result.stderr)
        process.exit(result.exitCode)
      }
      return null
    },
    () => '{}',
  )
}

if (isDirectEntrypoint(import.meta.url)) {
  void main()
}
