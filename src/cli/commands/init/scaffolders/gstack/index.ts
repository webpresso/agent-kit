/**
 * `gstack` scaffolder preset.
 *
 * gstack uses a canonical checkout installed at `~/.claude/skills/gstack/`.
 * Agent-kit owns that checkout bootstrap, then lets gstack's own host-aware
 * setup command materialize additional surfaces such as Codex from the same
 * checkout.
 *
 * Detection for the canonical checkout is path-based, NOT PATH-based: gstack
 * itself is not a CLI binary on $PATH. Checkout bootstrap is a clone +
 * `./setup --team`. When Codex is detected, webpresso runs gstack's explicit
 * `./setup --host codex --team` flow from that same checkout so Codex is
 * materialized without accidentally fanning out to every host binary on PATH.
 *
 * Side-effect outside the consumer repo: writes to the user's home dir.
 * This is intentional — gstack is global by design.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'
import { getStateRoot, getSurfacePath } from '#paths/state-root.js'
import { makeNoopSpinnerFactory, type SpinnerFactory } from '#cli/commands/init/scaffolders/spinner'

export interface EnsureGstackInput {
  repoRoot: string
  options: MergeOptions
  /** Override gstack install root (defaults to ~/.claude/skills/gstack). Useful in tests. */
  installRoot?: string
  /** Override Codex config path (defaults to ~/.codex/config.toml). Useful in tests. */
  codexConfigPath?: string
  /** Override Codex skills root (defaults to ~/.codex/skills). Useful in tests. */
  codexSkillsRoot?: string
  /** DI seam for child_process.spawn. */
  spawn?: SpawnLike
  /** DI seam for child_process.spawnSync for probes. */
  probeSpawnSync?: typeof spawnSync
  /** DI seam for fs.existsSync. */
  exists?: typeof existsSync
  /** DI seam for Codex detection in tests. */
  detectCodex?: (input: {
    spawnSync: typeof spawnSync
    exists: typeof existsSync
    codexConfigPath: string
  }) => boolean
  /** DI seam for spinner. Defaults to noop when !process.stdout.isTTY, ora otherwise. */
  spinnerFactory?: SpinnerFactory
  /** DI seam for environment-backed host/output policy. */
  env?: NodeJS.ProcessEnv
  /** DI seam for user-visible progress lines. */
  log?: (message: string) => void
  /** DI seam for timing. */
  now?: () => number
  /** DI seam for platform-specific process behavior. */
  platform?: NodeJS.Platform
  /** DI seam for signal listener installation. */
  signalTarget?: SignalTarget
  /** DI seam for process-group signaling. */
  processKill?: typeof process.kill
  /** DI seam for verbose output streaming. */
  streamOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void
  /** Override the session log path. Useful in tests. */
  sessionLogPath?: string
  /** DI seam for timers. */
  setTimeoutImpl?: typeof setTimeout
  /** DI seam for timers. */
  clearTimeoutImpl?: typeof clearTimeout
  /** DI seam for quiet-mode progress heartbeats. */
  heartbeatIntervalMs?: number
}

export type GstackCodexResult =
  | { kind: 'gstack-codex-installed'; skillsRoot: string }
  | { kind: 'gstack-codex-updated'; skillsRoot: string }
  | { kind: 'gstack-codex-skipped'; reason: 'not-detected' | 'not-requested'; skillsRoot: string }

export type GstackFailureReason = 'exit-nonzero' | 'inactivity-timeout' | 'signal-interrupted'

type GstackTimedOutCommand = 'git clone' | 'git pull' | GstackSetupCommand

type GstackFailureBase = {
  exitCode: number
  reason: GstackFailureReason
  logPath: string
  timedOutCommand?: GstackTimedOutCommand
}

export type EnsureGstackResult =
  | { kind: 'gstack-installed'; root: string; codex: GstackCodexResult }
  | { kind: 'gstack-updated'; root: string; codex: GstackCodexResult }
  | { kind: 'gstack-skipped-dry-run' }
  | ({ kind: 'gstack-clone-failed' } & GstackFailureBase)
  | ({ kind: 'gstack-pull-failed' } & GstackFailureBase)
  | ({ kind: 'gstack-setup-failed'; command: GstackSetupCommand } & GstackFailureBase)

const GSTACK_REPO = 'https://github.com/garrytan/gstack.git'
const DEFAULT_INACTIVITY_MS = 600_000
const DEFAULT_HEARTBEAT_MS = 30_000
const FORCE_KILL_GRACE_MS = 5_000

function defaultInstallRoot(): string {
  return path.join(process.env.HOME || homedir(), '.claude', 'skills', 'gstack')
}

function defaultCodexConfigPath(): string {
  return path.join(process.env.HOME || homedir(), '.codex', 'config.toml')
}

function defaultCodexSkillsRoot(): string {
  return path.join(process.env.HOME || homedir(), '.codex', 'skills')
}

type GstackSetupHost = 'auto' | 'codex'
type GstackSetupArgs = ['--team'] | ['--host', GstackSetupHost, '--team']
type GstackSetupCommand = '--team' | `--host ${GstackSetupHost} --team`
type GstackSetupStep = { args: GstackSetupArgs; command: GstackSetupCommand; label: string }

type SignalName = 'SIGINT' | 'SIGTERM'

type SignalTarget = Pick<NodeJS.Process, 'on' | 'off'>

type SpawnedChild = ReturnType<typeof spawn>
type SpawnLike = (command: string, args: readonly string[], options: SpawnOptions) => SpawnedChild

type SpawnOptions = {
  cwd?: string
  detached: boolean
  stdio: ['ignore', 'pipe', 'pipe']
  windowsHide: boolean
}

type GstackCommandName = 'git clone' | 'git pull' | GstackSetupCommand

type GstackCommandSpec = {
  command: string
  args: readonly string[]
  cwd?: string
  name: GstackCommandName
  label: string
}

type GstackCommandOutcome = {
  ok: boolean
  exitCode: number
  reason?: GstackFailureReason
  command: GstackCommandName
}

function formatDurationMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, '')
}

function summarizeChunk(text: string): string | null {
  const lines = stripAnsi(text)
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const last = lines.at(-1)
  if (!last) return null
  return last.length > 140 ? `${last.slice(0, 137)}...` : last
}

function isVerboseGstack(env: NodeJS.ProcessEnv): boolean {
  return env.WP_VERBOSE_GSTACK === '1'
}

function maybeLogQuietModeAdvisory(env: NodeJS.ProcessEnv, log: (message: string) => void): void {
  if (isVerboseGstack(env)) return
  log(
    '  gstack: quiet mode can take a few minutes on first run (for example while Playwright Chromium installs); set WP_VERBOSE_GSTACK=1 for upstream logs.',
  )
}

function parseHostList(value: string): Array<'claude' | 'codex' | 'auto'> | null {
  const hosts = value
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  if (hosts.length === 0) return null
  if (hosts.includes('auto')) return ['auto']
  if (hosts.some((host) => host !== 'claude' && host !== 'codex')) return null
  return [...new Set(hosts)] as Array<'claude' | 'codex'>
}

function parseInactivityMs(env: NodeJS.ProcessEnv): number {
  const raw = env.WP_GSTACK_INACTIVITY_MS?.trim()
  if (!raw) return DEFAULT_INACTIVITY_MS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_INACTIVITY_MS
  return parsed
}

function resolveSetupSteps(input: {
  codexDetected: boolean
  env: NodeJS.ProcessEnv
  log: (message: string) => void
}): GstackSetupStep[] {
  const explicitHosts = input.env.WP_GSTACK_HOSTS?.trim()
  if (explicitHosts) {
    const parsed = parseHostList(explicitHosts)
    if (!parsed) {
      input.log(
        `  gstack: ignoring invalid WP_GSTACK_HOSTS=${JSON.stringify(explicitHosts)}; falling back to default fast mode`,
      )
    } else {
      return parsed.map((host) =>
        host === 'claude'
          ? {
              args: ['--team'],
              command: '--team',
              label: 'refreshing Claude/team integration',
            }
          : host === 'codex'
            ? {
                args: ['--host', 'codex', '--team'],
                command: '--host codex --team',
                label: 'refreshing Codex integration',
              }
            : {
                args: ['--host', 'auto', '--team'],
                command: '--host auto --team',
                label: 'refreshing all detected gstack hosts',
              },
      )
    }
  }

  if (input.env.WP_GSTACK_MODE === 'full') {
    return [
      {
        args: ['--host', 'auto', '--team'],
        command: '--host auto --team',
        label: 'refreshing all detected gstack hosts',
      },
    ]
  }

  const steps: GstackSetupStep[] = [
    {
      args: ['--team'],
      command: '--team',
      label: 'refreshing Claude/team integration',
    },
  ]
  if (input.codexDetected) {
    steps.push({
      args: ['--host', 'codex', '--team'],
      command: '--host codex --team',
      label: 'refreshing Codex integration',
    })
  }
  return steps
}

function defaultDetectCodex(input: {
  spawnSync: typeof spawnSync
  exists: typeof existsSync
  codexConfigPath: string
}): boolean {
  if (input.exists(input.codexConfigPath)) return true
  const probe = input.spawnSync('codex', ['--version'], { stdio: 'ignore' })
  return probe.status === 0
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function resolveSessionLogPath(repoRoot: string, now: () => number): string {
  const stamp = new Date(now()).toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const fileName = `${stamp}-${process.pid}-gstack.log`
  try {
    return getSurfacePath(path.join('init', 'gstack', fileName), 'worktree', repoRoot)
  } catch {
    return path.join(
      getStateRoot(),
      'repo-fallback',
      sha256Hex(repoRoot).slice(0, 16),
      'init',
      'gstack',
      fileName,
    )
  }
}

function initializeSessionLog(
  logPath: string,
  input: {
    repoRoot: string
    installRoot: string
    env: NodeJS.ProcessEnv
    platform: NodeJS.Platform
    inactivityMs: number
    now: () => number
  },
): void {
  mkdirSync(path.dirname(logPath), { recursive: true })
  writeFileSync(
    logPath,
    [
      `# gstack setup session`,
      `started_at=${new Date(input.now()).toISOString()}`,
      `repo_root=${input.repoRoot}`,
      `install_root=${input.installRoot}`,
      `platform=${input.platform}`,
      `verbose=${isVerboseGstack(input.env) ? '1' : '0'}`,
      `inactivity_ms=${input.inactivityMs}`,
      '',
    ].join('\n'),
    'utf8',
  )
}

function appendSessionLog(logPath: string, text: string): void {
  appendFileSync(logPath, text, 'utf8')
}

const COMMON_SIGNAL_NUMBERS: Readonly<Partial<Record<NodeJS.Signals, number>>> = {
  SIGINT: 2,
  SIGKILL: 9,
  SIGTERM: 15,
}

function exitCodeFromSignal(signal: NodeJS.Signals | null): number {
  if (!signal) return 1
  return 128 + (COMMON_SIGNAL_NUMBERS[signal] ?? 15)
}

function deliverSignalToChild(input: {
  child: SpawnedChild
  platform: NodeJS.Platform
  signal: NodeJS.Signals
  processKill: typeof process.kill
}): void {
  if (input.platform !== 'win32' && input.child.pid) {
    try {
      input.processKill(-input.child.pid, input.signal)
      return
    } catch {
      // Fall through to direct-child kill when the group is already gone or unavailable.
    }
  }
  input.child.kill(input.signal)
}

async function runLoggedCommand(input: {
  spec: GstackCommandSpec
  spawnImpl: SpawnLike
  env: NodeJS.ProcessEnv
  log: (message: string) => void
  now: () => number
  inactivityMs: number
  logPath: string
  platform: NodeJS.Platform
  signalTarget: SignalTarget
  processKill: typeof process.kill
  streamOutput: (stream: 'stdout' | 'stderr', chunk: string) => void
  setTimeoutImpl: typeof setTimeout
  clearTimeoutImpl: typeof clearTimeout
  heartbeatIntervalMs: number
}): Promise<GstackCommandOutcome> {
  const startedAt = input.now()
  const verbose = isVerboseGstack(input.env)
  const args =
    input.spec.command === './setup' && !verbose
      ? [...input.spec.args, '--quiet']
      : [...input.spec.args]

  input.log(`  gstack: ${input.spec.label}...`)
  appendSessionLog(
    input.logPath,
    [
      `\n=== ${input.spec.name} ===`,
      `cwd=${input.spec.cwd ?? process.cwd()}`,
      `$ ${input.spec.command} ${args.join(' ')}`,
      '',
    ].join('\n'),
  )

  return await new Promise<GstackCommandOutcome>((resolve) => {
    const child = input.spawnImpl(input.spec.command, args, {
      cwd: input.spec.cwd,
      detached: input.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let settled = false
    let timedOut = false
    let interrupted = false
    let forwardedSignal: NodeJS.Signals | null = null
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null
    let escalationTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null
    let lastOutputAt = startedAt
    let lastOutputSummary: string | null = null

    const clearTimers = (): void => {
      if (inactivityTimer !== null) {
        input.clearTimeoutImpl(inactivityTimer)
        inactivityTimer = null
      }
      if (escalationTimer !== null) {
        input.clearTimeoutImpl(escalationTimer)
        escalationTimer = null
      }
      if (heartbeatTimer !== null) {
        input.clearTimeoutImpl(heartbeatTimer)
        heartbeatTimer = null
      }
    }

    const cleanupSignalListeners = (): void => {
      input.signalTarget.off('SIGINT', onSigInt)
      input.signalTarget.off('SIGTERM', onSigTerm)
    }

    const finalize = (outcome: GstackCommandOutcome): void => {
      if (settled) return
      settled = true
      clearTimers()
      cleanupSignalListeners()
      resolve(outcome)
    }

    const refreshInactivityTimer = (): void => {
      if (timedOut || interrupted || settled) return
      if (inactivityTimer !== null) input.clearTimeoutImpl(inactivityTimer)
      inactivityTimer = input.setTimeoutImpl(() => {
        timedOut = true
        appendSessionLog(
          input.logPath,
          `\n[gstack] inactivity timeout after ${input.inactivityMs}ms while running ${input.spec.name}\n`,
        )
        deliverSignalToChild({
          child,
          platform: input.platform,
          signal: 'SIGTERM',
          processKill: input.processKill,
        })
        if (input.platform !== 'win32') {
          escalationTimer = input.setTimeoutImpl(() => {
            appendSessionLog(
              input.logPath,
              `[gstack] SIGTERM grace period expired after ${FORCE_KILL_GRACE_MS}ms; escalating ${input.spec.name} to SIGKILL\n`,
            )
            deliverSignalToChild({
              child,
              platform: input.platform,
              signal: 'SIGKILL',
              processKill: input.processKill,
            })
          }, FORCE_KILL_GRACE_MS)
        } else {
          appendSessionLog(
            input.logPath,
            '[gstack] Windows timeout cleanup is best-effort direct-child termination only; grandchild teardown is not guaranteed.\n',
          )
        }
      }, input.inactivityMs)
    }

    const scheduleHeartbeat = (): void => {
      if (verbose || settled) return
      heartbeatTimer = input.setTimeoutImpl(() => {
        if (settled) return
        const now = input.now()
        const quietForMs = now - lastOutputAt
        if (quietForMs >= input.heartbeatIntervalMs) {
          const message = lastOutputSummary
            ? `  gstack: still ${input.spec.label} (${formatDurationMs(now - startedAt)} elapsed; last child output ${formatDurationMs(quietForMs)} ago: ${lastOutputSummary})`
            : `  gstack: still ${input.spec.label} (${formatDurationMs(now - startedAt)} elapsed; no child output yet)`
          input.log(message)
          appendSessionLog(input.logPath, `\n[gstack] heartbeat ${input.spec.name}: ${message.trim()}\n`)
        }
        scheduleHeartbeat()
      }, input.heartbeatIntervalMs)
    }

    const forwardInterrupt = (signal: SignalName): void => {
      if (timedOut || interrupted || settled) return
      interrupted = true
      forwardedSignal = signal
      appendSessionLog(
        input.logPath,
        `\n[gstack] parent received ${signal}; interrupting ${input.spec.name}\n`,
      )
      deliverSignalToChild({
        child,
        platform: input.platform,
        signal,
        processKill: input.processKill,
      })
      if (input.platform === 'win32') {
        appendSessionLog(
          input.logPath,
          '[gstack] Windows interrupt cleanup is best-effort direct-child termination only; grandchild teardown is not guaranteed.\n',
        )
      }
    }

    const onSigInt = (): void => {
      forwardInterrupt('SIGINT')
    }
    const onSigTerm = (): void => {
      forwardInterrupt('SIGTERM')
    }

    input.signalTarget.on('SIGINT', onSigInt)
    input.signalTarget.on('SIGTERM', onSigTerm)
    refreshInactivityTimer()
    scheduleHeartbeat()

    const onChunk = (streamName: 'stdout' | 'stderr', chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      appendSessionLog(input.logPath, text)
      lastOutputAt = input.now()
      lastOutputSummary = summarizeChunk(text) ?? lastOutputSummary
      if (verbose) input.streamOutput(streamName, text)
      refreshInactivityTimer()
    }

    child.stdout?.on('data', (chunk: Buffer | string) => {
      onChunk('stdout', chunk)
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      onChunk('stderr', chunk)
    })

    child.on('error', (error: Error) => {
      appendSessionLog(
        input.logPath,
        `\n[gstack] spawn error while running ${input.spec.name}: ${error.message}\n`,
      )
      const reason: GstackFailureReason = timedOut
        ? 'inactivity-timeout'
        : interrupted
          ? 'signal-interrupted'
          : 'exit-nonzero'
      const exitCode =
        reason === 'signal-interrupted'
          ? exitCodeFromSignal(forwardedSignal)
          : reason === 'inactivity-timeout'
            ? exitCodeFromSignal('SIGTERM')
            : -1
      finalize({ ok: false, exitCode, reason, command: input.spec.name })
    })

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      const computedExitCode = (() => {
        if (interrupted) {
          if (code !== null && code !== 0) return code
          return exitCodeFromSignal(forwardedSignal ?? signal ?? 'SIGINT')
        }
        if (timedOut) {
          if (code !== null && code !== 0) return code
          return exitCodeFromSignal(signal ?? 'SIGTERM')
        }
        return code ?? exitCodeFromSignal(signal)
      })()

      if (code === 0 && !timedOut && !interrupted) {
        input.log(
          `  gstack: ${input.spec.label} done (${formatDurationMs(input.now() - startedAt)})`,
        )
        appendSessionLog(
          input.logPath,
          `\n[gstack] ${input.spec.name} completed in ${formatDurationMs(input.now() - startedAt)}\n`,
        )
        finalize({ ok: true, exitCode: 0, command: input.spec.name })
        return
      }

      const reason: GstackFailureReason = timedOut
        ? 'inactivity-timeout'
        : interrupted
          ? 'signal-interrupted'
          : 'exit-nonzero'
      appendSessionLog(
        input.logPath,
        `\n[gstack] ${input.spec.name} failed (${reason}, exit=${computedExitCode}${signal ? `, signal=${signal}` : ''})\n`,
      )
      finalize({
        ok: false,
        exitCode: computedExitCode,
        reason,
        command: input.spec.name,
      })
    })
  })
}

function finalizeCodexResult(input: {
  requestsCodex: boolean
  usesAutoHosts: boolean
  codexDetected: boolean
  hadCodexSkills: boolean
  codexSkillsRoot: string
}): GstackCodexResult {
  if (input.requestsCodex) {
    return input.hadCodexSkills
      ? { kind: 'gstack-codex-updated', skillsRoot: input.codexSkillsRoot }
      : { kind: 'gstack-codex-installed', skillsRoot: input.codexSkillsRoot }
  }
  if (input.usesAutoHosts) {
    if (!input.codexDetected) {
      return {
        kind: 'gstack-codex-skipped',
        reason: 'not-detected',
        skillsRoot: input.codexSkillsRoot,
      }
    }
    return input.hadCodexSkills
      ? { kind: 'gstack-codex-updated', skillsRoot: input.codexSkillsRoot }
      : { kind: 'gstack-codex-installed', skillsRoot: input.codexSkillsRoot }
  }
  if (!input.codexDetected) {
    return {
      kind: 'gstack-codex-skipped',
      reason: 'not-detected',
      skillsRoot: input.codexSkillsRoot,
    }
  }
  return {
    kind: 'gstack-codex-skipped',
    reason: 'not-requested',
    skillsRoot: input.codexSkillsRoot,
  }
}

function buildFailureResult(input: {
  stage: 'clone' | 'pull' | 'setup'
  outcome: GstackCommandOutcome
  logPath: string
}): Extract<EnsureGstackResult, {
  kind: 'gstack-clone-failed' | 'gstack-pull-failed' | 'gstack-setup-failed'
}> {
  const base = {
    exitCode: input.outcome.exitCode,
    reason: input.outcome.reason ?? 'exit-nonzero',
    logPath: input.logPath,
    ...(input.outcome.reason === 'inactivity-timeout'
      ? { timedOutCommand: input.outcome.command }
      : {}),
  }

  switch (input.stage) {
    case 'clone':
      return { kind: 'gstack-clone-failed', ...base }
    case 'pull':
      return { kind: 'gstack-pull-failed', ...base }
    case 'setup':
      return {
        kind: 'gstack-setup-failed',
        command: input.outcome.command as GstackSetupCommand,
        ...base,
      }
  }
}

/**
 * Ensure gstack is installed and up-to-date.
 * - Not present: clone from main + setup.
 * - Already present: pull latest main + re-run setup.
 * - If Codex is detected: materialize Codex skills from the canonical checkout.
 */
export async function ensureGstack(input: EnsureGstackInput): Promise<EnsureGstackResult> {
  if (input.options.dryRun) return { kind: 'gstack-skipped-dry-run' }

  const spawnImpl = input.spawn ?? ((command, args, options) => spawn(command, [...args], options))
  const probeSpawnSync = input.probeSpawnSync ?? spawnSync
  const exists = input.exists ?? existsSync
  const detectCodex = input.detectCodex ?? defaultDetectCodex
  const env = input.env ?? process.env
  const log = input.log ?? console.log
  const now = input.now ?? Date.now
  const root = input.installRoot ?? defaultInstallRoot()
  const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath()
  const codexSkillsRoot = input.codexSkillsRoot ?? defaultCodexSkillsRoot()
  const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())('gstack')
  const platform = input.platform ?? process.platform
  const signalTarget = input.signalTarget ?? process
  const processKill = input.processKill ?? process.kill.bind(process)
  const streamOutput =
    input.streamOutput ??
    ((stream: 'stdout' | 'stderr', chunk: string) => {
      if (stream === 'stdout') process.stdout.write(chunk)
      else process.stderr.write(chunk)
    })
  const setTimeoutImpl = input.setTimeoutImpl ?? setTimeout
  const clearTimeoutImpl = input.clearTimeoutImpl ?? clearTimeout
  const heartbeatIntervalMs = input.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS
  const inactivityMs = parseInactivityMs(env)
  const logPath = input.sessionLogPath ?? resolveSessionLogPath(input.repoRoot, now)
  initializeSessionLog(logPath, {
    repoRoot: input.repoRoot,
    installRoot: root,
    env,
    platform,
    inactivityMs,
    now,
  })

  const hasSetup = exists(path.join(root, 'setup'))
  const hasGitDir = exists(path.join(root, '.git'))
  const codexDetected = detectCodex({
    spawnSync: probeSpawnSync,
    exists,
    codexConfigPath,
  })
  const hadCodexSkills = exists(path.join(codexSkillsRoot, 'gstack'))
  const steps = resolveSetupSteps({ codexDetected, env, log })
  const requestsCodex = steps.some((step) => step.command === '--host codex --team')
  const usesAutoHosts = steps.some((step) => step.command === '--host auto --team')
  if (steps.length > 0) {
    maybeLogQuietModeAdvisory(env, log)
  }

  spinner.start()

  if (hasSetup && hasGitDir) {
    const pull = await runLoggedCommand({
      spec: {
        command: 'git',
        args: ['pull', '--ff-only', 'origin', 'main'],
        cwd: root,
        name: 'git pull',
        label: 'refreshing canonical checkout',
      },
      spawnImpl,
      env,
      log,
      now,
      inactivityMs,
      logPath,
      platform,
      signalTarget,
      processKill,
      streamOutput,
      setTimeoutImpl,
      clearTimeoutImpl,
      heartbeatIntervalMs,
    })
    if (!pull.ok) {
      spinner.fail('gstack pull failed')
      return buildFailureResult({ stage: 'pull', outcome: pull, logPath })
    }
  }

  if (!hasSetup) {
    const clone = await runLoggedCommand({
      spec: {
        command: 'git',
        args: ['clone', '--depth', '1', GSTACK_REPO, root],
        name: 'git clone',
        label: 'cloning canonical checkout',
      },
      spawnImpl,
      env,
      log,
      now,
      inactivityMs,
      logPath,
      platform,
      signalTarget,
      processKill,
      streamOutput,
      setTimeoutImpl,
      clearTimeoutImpl,
      heartbeatIntervalMs,
    })
    if (!clone.ok) {
      spinner.fail('gstack clone failed')
      return buildFailureResult({ stage: 'clone', outcome: clone, logPath })
    }
  }

  for (const step of steps) {
    const setup = await runLoggedCommand({
      spec: {
        command: './setup',
        args: step.args,
        cwd: root,
        name: step.command,
        label: step.label,
      },
      spawnImpl,
      env,
      log,
      now,
      inactivityMs,
      logPath,
      platform,
      signalTarget,
      processKill,
      streamOutput,
      setTimeoutImpl,
      clearTimeoutImpl,
      heartbeatIntervalMs,
    })
    if (!setup.ok) {
      spinner.fail(step.command === '--team' ? 'gstack setup failed' : 'gstack codex setup failed')
      return buildFailureResult({ stage: 'setup', outcome: setup, logPath })
    }
  }

  const codex = finalizeCodexResult({
    requestsCodex,
    usesAutoHosts,
    codexDetected,
    hadCodexSkills,
    codexSkillsRoot,
  })

  appendSessionLog(logPath, `\n[gstack] overall success at ${new Date(now()).toISOString()}\n`)
  spinner.succeed(hasSetup ? 'gstack updated' : 'gstack installed')
  if (isVerboseGstack(env)) {
    log(`  gstack: session log ${logPath}`)
  }
  return hasSetup ? { kind: 'gstack-updated', root, codex } : { kind: 'gstack-installed', root, codex }
}
