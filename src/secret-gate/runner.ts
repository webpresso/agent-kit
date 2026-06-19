import { spawn } from 'node:child_process'

import { buildRuntimeProcessEnv } from '#runtime/index.js'

export interface SecretGateCommand {
  readonly command: string
  readonly args: readonly string[]
}

export interface SecretGateCommandOptions {
  readonly maxOutputBytes?: number
  readonly sink?: string
  readonly profile?: string
  readonly envProfile?: string
  readonly secretEnvProfile?: string
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

export interface SecretGateRunResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  readonly aborted: boolean
  readonly signal: NodeJS.Signals | null
}

const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024

const SIGNAL_TO_EXIT_CODE: Readonly<Partial<Record<NodeJS.Signals, number>>> = {
  SIGINT: 2,
  SIGKILL: 9,
  SIGTERM: 15,
}

const SECRET_GATE_RUNTIME_PROFILES = [
  'none',
  'public',
  'secrets-only',
  'service-runtime',
  'database',
  'full',
] as const

const DIRECT_ENV_PROFILES = new Set(['none', 'public'])

export function isSecretGateRuntimeProfile(value: string | undefined): boolean {
  return SECRET_GATE_RUNTIME_PROFILES.includes(
    value as (typeof SECRET_GATE_RUNTIME_PROFILES)[number],
  )
}

export function buildSecretGateCommand(options: SecretGateCommandOptions): SecretGateCommand {
  const envProfile = options.envProfile?.trim()
  if (envProfile && !isSecretGateRuntimeProfile(envProfile)) {
    throw new Error(
      `Unsupported secret-gate envProfile "${envProfile}". Use one of: ${SECRET_GATE_RUNTIME_PROFILES.join(', ')}. Pass provider-specific Doppler/Infisical selectors via secretEnvProfile.`,
    )
  }
  if (envProfile && DIRECT_ENV_PROFILES.has(envProfile)) {
    return { command: options.command, args: [...(options.args ?? [])] }
  }
  const sink = options.sink?.trim()
  if (!sink) {
    throw new Error('Secret-gate sink is required when secret resolution is enabled.')
  }
  const profile = options.profile?.trim() || options.secretEnvProfile?.trim() || 'preview'
  const args = [
    'secrets',
    'run',
    '--sink',
    sink,
    '--profile',
    profile,
    '--',
    options.command,
    ...(options.args ?? []),
  ]
  return { command: 'wp', args }
}

function exitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) return 1
  return 128 + (SIGNAL_TO_EXIT_CODE[signal] ?? 15)
}

export function runSecretGateCommand(
  options: SecretGateCommandOptions,
): Promise<SecretGateRunResult> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  const command = buildSecretGateCommand(options)

  return new Promise((resolve) => {
    const child = spawn(command.command, [...command.args], {
      cwd: options.cwd,
      env: buildRuntimeProcessEnv(options.cwd, process.env),
      detached: process.platform !== 'win32',
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = false

    const timer = setTimeout(() => {
      timedOut = true
      killProcessTree(child.pid, child.kill.bind(child), 'SIGTERM')
    }, timeoutMs)

    const onAbort = (): void => {
      aborted = true
      killProcessTree(child.pid, child.kill.bind(child), 'SIGTERM')
    }

    if (options.signal) {
      if (options.signal.aborted) queueMicrotask(onAbort)
      else options.signal.addEventListener('abort', onAbort, { once: true })
    }

    const cleanup = (): void => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendBoundedOutput(stdout, chunk, maxOutputBytes)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendBoundedOutput(stderr, chunk, maxOutputBytes)
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      cleanup()
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
        aborted,
        signal: null,
      })
    })

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      resolve({
        exitCode: code ?? exitCodeFromSignal(signal),
        stdout,
        stderr,
        timedOut,
        aborted,
        signal,
      })
    })
  })
}

function killProcessTree(
  pid: number | undefined,
  fallbackKill: (signal: NodeJS.Signals) => boolean,
  signal: NodeJS.Signals,
): void {
  if (pid && process.platform !== 'win32') {
    try {
      process.kill(-pid, signal)
      return
    } catch {
      // Fall through to killing the child when process-group cleanup is not available.
    }
  }
  fallbackKill(signal)
}

function appendBoundedOutput(current: string, chunk: Buffer, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  const next = current + chunk.toString('utf8')
  if (Buffer.byteLength(next, 'utf8') <= maxBytes) return next
  const marker = '\n[output truncated by secret-gate runner]\n'
  const markerBytes = Buffer.byteLength(marker, 'utf8')
  const budget = Math.max(0, maxBytes - markerBytes)
  return `${next.slice(0, budget)}${marker}`
}
