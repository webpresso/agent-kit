import { spawn } from 'node:child_process'

export interface SecretGateCommand {
  readonly command: string
  readonly args: readonly string[]
}

export interface SecretGateCommandOptions {
  readonly runner?: string
  readonly envProfile?: string
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

const SIGNAL_TO_EXIT_CODE: Readonly<Partial<Record<NodeJS.Signals, number>>> = {
  SIGINT: 2,
  SIGKILL: 9,
  SIGTERM: 15,
}

export function buildSecretGateCommand(options: SecretGateCommandOptions): SecretGateCommand {
  const runner = (options.runner ?? 'with-secrets').trim()
  const envProfile = (options.envProfile ?? 'secrets-only').trim()
  const args = [
    '--env-profile',
    envProfile,
    '--',
    options.command,
    ...(options.args ?? []),
  ]
  return { command: runner, args }
}

function exitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) return 1
  return 128 + (SIGNAL_TO_EXIT_CODE[signal] ?? 15)
}

export function runSecretGateCommand(options: SecretGateCommandOptions): Promise<SecretGateRunResult> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const command = buildSecretGateCommand(options)

  return new Promise((resolve) => {
    const child = spawn(command.command, [...command.args], {
      cwd: options.cwd,
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    const onAbort = (): void => {
      aborted = true
      child.kill('SIGTERM')
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
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
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
