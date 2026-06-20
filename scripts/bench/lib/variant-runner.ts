import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractToolUses, extractUsage, type Usage } from './usage-extractor'
import { recordStream } from './transcript-recorder'

export type BenchAuthMode = 'api-key' | 'claude-login'
export type BenchProvider = 'claude' | 'codex'

export type VariantSpawn = (
  cmd: string[],
  options: {
    cwd: string
    env: Record<string, string>
    stdout: 'pipe'
    stderr: 'pipe'
  },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>

export type RunCellInput = {
  scenario: string
  prompt: string
  variant: string
  trial: number
  pluginDir: string
  runId?: string
  cwd?: string
  outputRoot?: string
  apiKeys?: Record<string, string | undefined>
  authMode?: BenchAuthMode
  claudeHome?: string
  provider?: BenchProvider
  codexHome?: string
  codexProfile?: string
  spawn?: VariantSpawn
}

export type ClaudeCliAuthState =
  | { kind: 'cli-login'; provider: 'firstParty' | string; email?: string; subscriptionType?: string }
  | { kind: 'api-key'; source: 'ANTHROPIC_API_KEY' }
  | { kind: 'missing'; reason: string }
  | {
      kind: 'execution-failed'
      auth: 'cli-login' | 'api-key' | 'unknown'
      status?: number
      message: string
    }

export type RunResult =
  | {
      ok: true
      usage: Usage
      local_wall_ms: number
      tools: string[]
      transcript_path: string
      home_dir: string
    }
  | {
      ok: false
      error: 'rate_limit' | 'spawn_failed'
      failure_reason?: string
      usage: null
      local_wall_ms: number
      tools: []
      transcript_path: null
      home_dir: string
    }

const benchLibDir = dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUTPUT_ROOT = resolve(benchLibDir, '..', 'runs')
const ZERO_TOOLS: [] = []

function variantEnvKey(variant: string): string {
  return `ANTHROPIC_API_KEY_${variant.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`
}

function resolveClaudeAuth(
  input: RunCellInput,
  cellHomeDir: string,
): {
  homeDir: string
  env: Record<string, string>
  mode: BenchAuthMode
} {
  if (input.authMode !== 'claude-login') {
    const envKey = variantEnvKey(input.variant)
    const apiKey = input.apiKeys?.[envKey] ?? process.env[envKey]
    return { homeDir: cellHomeDir, env: apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}, mode: 'api-key' }
  }

  const loggedInHome = input.claudeHome ?? process.env.BENCH_CLAUDE_HOME ?? process.env.HOME
  if (!loggedInHome) {
    throw new Error('BENCH_AUTH_MODE=claude-login requires HOME or BENCH_CLAUDE_HOME')
  }

  return { homeDir: loggedInHome, env: {}, mode: 'claude-login' }
}

function resolveCodexAuth(
  input: RunCellInput,
  cellHomeDir: string,
): {
  homeDir: string
  env: Record<string, string>
  mode: 'codex'
} {
  const homeDir = input.codexHome ?? process.env.BENCH_CODEX_HOME ?? cellHomeDir
  const apiKey = input.apiKeys?.CODEX_API_KEY ?? process.env.CODEX_API_KEY
  return {
    homeDir,
    env: {
      CODEX_HOME: homeDir,
      ...(apiKey ? { CODEX_API_KEY: apiKey } : {}),
    },
    mode: 'codex',
  }
}

function inheritedProcessEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function withoutClaudeApiKeyEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => {
      if (key === 'ANTHROPIC_API_KEY' || key === 'CLAUDE_API_KEY') return false
      if (/^(?:ANTHROPIC|CLAUDE)_API_KEY_/u.test(key)) return false
      return true
    }),
  )
}

async function spawnWithBun(
  cmd: string[],
  options: {
    cwd: string
    env: Record<string, string>
    stdout: 'pipe'
    stderr: 'pipe'
  },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, options)
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { exitCode, stdout, stderr }
}


function parseJsonAuthStatus(raw: string): ClaudeCliAuthState | undefined {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const loggedIn = parsed['loggedIn'] ?? parsed['logged_in'] ?? parsed['authenticated']
    if (loggedIn !== true) return undefined
    const provider = String(parsed['provider'] ?? parsed['authProvider'] ?? parsed['source'] ?? 'firstParty')
    const normalizedProvider = /claude\.ai|first.?party|subscription/i.test(provider)
      ? 'firstParty'
      : provider
    const email = typeof parsed['email'] === 'string' ? parsed['email'] : undefined
    const subscriptionType =
      typeof parsed['subscriptionType'] === 'string'
        ? parsed['subscriptionType']
        : typeof parsed['subscription_type'] === 'string'
          ? parsed['subscription_type']
          : undefined
    return {
      kind: 'cli-login',
      provider: normalizedProvider,
      ...(email ? { email } : {}),
      ...(subscriptionType ? { subscriptionType } : {}),
    }
  } catch {
    return undefined
  }
}

function truncateFailureReason(value: string, maxLength = 600): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…[truncated]`
}

export function parseClaudeAuthStatusOutput(stdout: string, stderr = ''): ClaudeCliAuthState {
  const combined = `${stdout}\n${stderr}`.trim()
  const json = parseJsonAuthStatus(combined)
  if (json) return json

  if (/not\s+(?:logged\s+in|authenticated)|login\s+required|unauthenticated/i.test(combined)) {
    return { kind: 'missing', reason: 'Claude CLI is not logged in.' }
  }

  if (/error|failed|could not|unable|timeout|network|denied|unauthorized/i.test(combined)) {
    return {
      kind: 'missing',
      reason: combined || 'Claude CLI auth status did not report a usable login.',
    }
  }

  if (/logged\s+in|authenticated|claude\.ai|subscription/i.test(combined)) {
    const email = combined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0]
    const subscriptionType = combined.match(/\b(max|pro|team|enterprise)\b/iu)?.[1]
    return {
      kind: 'cli-login',
      provider: /claude\.ai|subscription|first.?party/i.test(combined) ? 'firstParty' : 'unknown',
      ...(email ? { email } : {}),
      ...(subscriptionType ? { subscriptionType } : {}),
    }
  }

  return {
    kind: 'missing',
    reason: combined || 'Claude CLI auth status returned no recognizable login state.',
  }
}

function statusFromAuthFailureText(text: string): number | undefined {
  const match = text.match(/\b(401|403|429|500|502|503)\b/u)
  return match ? Number(match[1]) : undefined
}

export function classifyClaudeExecutionFailure(input: {
  authMode: BenchAuthMode
  authState?: ClaudeCliAuthState
  stdout: string
  stderr: string
}): ClaudeCliAuthState {
  const combined = `${input.stdout}\n${input.stderr}`.trim()
  const status = statusFromAuthFailureText(combined)
  if (input.authMode === 'claude-login') {
    if (status === 401 && input.authState?.kind === 'cli-login') {
      return {
        kind: 'execution-failed',
        auth: 'cli-login',
        status,
        message:
          'Claude CLI auth status reports a logged-in first-party session, but claude execution returned 401. Refresh the Claude CLI login/session and retry.',
      }
    }
    return {
      kind: 'execution-failed',
      auth: 'cli-login',
      ...(status ? { status } : {}),
      message: combined || 'Claude CLI execution failed while using local CLI login auth.',
    }
  }

  return {
    kind: 'execution-failed',
    auth: input.authMode === 'api-key' ? 'api-key' : 'unknown',
    ...(status ? { status } : {}),
    message:
      status === 401
        ? 'Claude API-key execution returned 401. Check ANTHROPIC_API_KEY or variant-specific API key environment.'
        : combined || 'Claude execution failed.',
  }
}

async function detectClaudeCliAuth(input: {
  spawn: VariantSpawn
  cwd: string
  env: Record<string, string>
}): Promise<ClaudeCliAuthState> {
  const result = await input.spawn(['claude', 'auth', 'status'], {
    cwd: input.cwd,
    env: input.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (result.exitCode !== 0) {
    return { kind: 'missing', reason: `${result.stdout}\n${result.stderr}`.trim() }
  }

  return parseClaudeAuthStatusOutput(result.stdout, result.stderr)
}

export function buildProviderCommand(input: {
  readonly provider?: BenchProvider
  readonly prompt: string
  readonly pluginDir: string
  readonly cwd: string
  readonly variant: string
  readonly lastMessagePath: string
  readonly codexProfile?: string
}): string[] {
  if ((input.provider ?? 'claude') === 'codex') {
    return [
      'codex',
      'exec',
      '--json',
      '--output-last-message',
      input.lastMessagePath,
      '--sandbox',
      'workspace-write',
      '--cd',
      input.cwd,
      '--profile',
      input.codexProfile ?? input.variant,
      '--ignore-user-config',
      input.prompt,
    ]
  }

  return [
    'claude',
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--plugin-dir',
    input.pluginDir,
    input.prompt,
  ]
}

function isRateLimit(text: string): boolean {
  return /rate[ -]?limit/i.test(text)
}

export async function runCell(input: RunCellInput): Promise<RunResult> {
  const cwd = input.cwd ?? process.cwd()
  const runId = input.runId ?? 'adhoc'
  const outputRoot = input.outputRoot ?? DEFAULT_OUTPUT_ROOT
  const cellRoot = join(outputRoot, runId, input.variant, input.scenario, `trial-${input.trial}`)
  const homeDir = join(cellRoot, 'home')
  const transcriptPath = join(cellRoot, 'transcript.jsonl')
  const lastMessagePath = join(cellRoot, 'last-message.txt')
  const provider = input.provider ?? 'claude'

  mkdirSync(homeDir, { recursive: true })

  const auth =
    provider === 'codex' ? resolveCodexAuth(input, homeDir) : resolveClaudeAuth(input, homeDir)
  const baseEnv = inheritedProcessEnv()
  const env = {
    ...(provider === 'claude' && auth.mode === 'claude-login'
      ? withoutClaudeApiKeyEnv(baseEnv)
      : baseEnv),
    HOME: auth.homeDir,
    ...auth.env,
  }

  const spawn = input.spawn ?? spawnWithBun
  const cmd = buildProviderCommand({
    provider,
    prompt: input.prompt,
    pluginDir: input.pluginDir,
    cwd,
    variant: input.variant,
    lastMessagePath,
    codexProfile: input.codexProfile,
  })

  let authState: ClaudeCliAuthState | undefined
  if (provider === 'claude' && auth.mode === 'claude-login') {
    const detected = await detectClaudeCliAuth({ spawn, cwd, env })
    authState = detected
    if (detected.kind !== 'cli-login') {
      const failureReason = detected.kind === 'execution-failed' ? detected.message : detected.reason
      return {
        ok: false,
        error: 'spawn_failed',
        failure_reason: truncateFailureReason(failureReason),
        usage: null,
        local_wall_ms: 0,
        tools: ZERO_TOOLS,
        transcript_path: null,
        home_dir: homeDir,
      }
    }
  }

  const start = performance.now()
  const result = await spawn(cmd, {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const localWallMs = Number((performance.now() - start).toFixed(6))

  const combined = `${result.stdout}\n${result.stderr}`.trim()
  if (isRateLimit(combined)) {
    if (existsSync(transcriptPath)) {
      rmSync(transcriptPath, { force: true })
    }

    return {
      ok: false,
      error: 'rate_limit',
      failure_reason: truncateFailureReason(combined),
      usage: null,
      local_wall_ms: localWallMs,
      tools: ZERO_TOOLS,
      transcript_path: null,
      home_dir: homeDir,
    }
  }

  if (result.exitCode !== 0) {
    const executionFailure =
      provider === 'claude'
        ? classifyClaudeExecutionFailure({
            authMode: auth.mode === 'claude-login' ? 'claude-login' : 'api-key',
            authState,
            stdout: result.stdout,
            stderr: result.stderr,
          })
        : undefined
    return {
      ok: false,
      error: 'spawn_failed',
      ...(executionFailure
        ? { failure_reason: truncateFailureReason(executionFailure.message) }
        : {}),
      usage: null,
      local_wall_ms: localWallMs,
      tools: ZERO_TOOLS,
      transcript_path: null,
      home_dir: homeDir,
    }
  }

  await recordStream(result.stdout, transcriptPath, input.scenario)

  return {
    ok: true,
    usage: extractUsage(result.stdout),
    local_wall_ms: localWallMs,
    tools: extractToolUses(result.stdout),
    transcript_path: transcriptPath,
    home_dir: homeDir,
  }
}
