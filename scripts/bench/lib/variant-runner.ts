import { existsSync, mkdirSync, rmSync } from 'node:fs'
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

export type RunResult =
  | {
      ok: true
      usage: Usage
      tools: string[]
      transcript_path: string
      home_dir: string
    }
  | {
      ok: false
      error: 'rate_limit' | 'spawn_failed'
      usage: null
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
} {
  if (input.authMode !== 'claude-login') {
    const envKey = variantEnvKey(input.variant)
    const apiKey = input.apiKeys?.[envKey] ?? process.env[envKey]
    return { homeDir: cellHomeDir, env: apiKey ? { ANTHROPIC_API_KEY: apiKey } : {} }
  }

  const loggedInHome = input.claudeHome ?? process.env.BENCH_CLAUDE_HOME ?? process.env.HOME
  if (!loggedInHome) {
    throw new Error('BENCH_AUTH_MODE=claude-login requires HOME or BENCH_CLAUDE_HOME')
  }

  return { homeDir: loggedInHome, env: {} }
}

function resolveCodexAuth(
  input: RunCellInput,
  cellHomeDir: string,
): {
  homeDir: string
  env: Record<string, string>
} {
  const homeDir = input.codexHome ?? process.env.BENCH_CODEX_HOME ?? cellHomeDir
  const apiKey = input.apiKeys?.CODEX_API_KEY ?? process.env.CODEX_API_KEY
  return {
    homeDir,
    env: {
      CODEX_HOME: homeDir,
      ...(apiKey ? { CODEX_API_KEY: apiKey } : {}),
    },
  }
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
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
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

  const result = await spawn(cmd, {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const combined = `${result.stdout}\n${result.stderr}`.trim()
  if (isRateLimit(combined)) {
    if (existsSync(transcriptPath)) {
      rmSync(transcriptPath, { force: true })
    }

    return {
      ok: false,
      error: 'rate_limit',
      usage: null,
      tools: ZERO_TOOLS,
      transcript_path: null,
      home_dir: homeDir,
    }
  }

  if (result.exitCode !== 0) {
    return {
      ok: false,
      error: 'spawn_failed',
      usage: null,
      tools: ZERO_TOOLS,
      transcript_path: null,
      home_dir: homeDir,
    }
  }

  await recordStream(result.stdout, transcriptPath, input.scenario)

  return {
    ok: true,
    usage: extractUsage(result.stdout),
    tools: extractToolUses(result.stdout),
    transcript_path: transcriptPath,
    home_dir: homeDir,
  }
}
