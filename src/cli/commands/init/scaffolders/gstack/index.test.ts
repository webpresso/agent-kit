import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ensureGstack, type EnsureGstackInput } from './index.js'

type SpawnBehavior = {
  pid?: number
  stdout?: string[]
  stderr?: string[]
  code?: number | null
  signal?: NodeJS.Signals | null
  autoClose?: boolean
  onSpawn?: (child: FakeChild) => void
  onKill?: (signal: NodeJS.Signals | number | undefined, child: FakeChild) => void
  error?: Error
}

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly pid: number
  readonly kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.behavior.onKill?.(signal, this)
    return true
  })

  constructor(private readonly behavior: SpawnBehavior) {
    super()
    this.pid = behavior.pid ?? 1234

    queueMicrotask(() => {
      if (behavior.error) {
        this.emit('error', behavior.error)
        return
      }

      if (behavior.onSpawn) {
        behavior.onSpawn(this)
      }

      if (behavior.autoClose === false) return

      for (const chunk of behavior.stdout ?? []) this.stdout.write(chunk)
      for (const chunk of behavior.stderr ?? []) this.stderr.write(chunk)
      this.stdout.end()
      this.stderr.end()
      this.emit('close', behavior.code ?? 0, behavior.signal ?? null)
    })
  }
}

function makeSpawn(behaviors: SpawnBehavior[]) {
  let index = 0
  return vi.fn((..._args: unknown[]) => {
    const next = behaviors[index] ?? { code: 0 }
    index += 1
    return new FakeChild(next)
  }) as unknown as NonNullable<EnsureGstackInput['spawn']>
}

function makeSpinnerFactory() {
  const start = vi.fn()
  const succeed = vi.fn()
  const fail = vi.fn()
  const factory = vi.fn(() => ({ start, succeed, fail }))
  return { factory, start, succeed, fail }
}

function createFakeEnv() {
  return { WP_GSTACK_REFRESH: '1' } as NodeJS.ProcessEnv
}

const tempDirs: string[] = []

function makeSessionLogPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gstack-scaffolder-'))
  tempDirs.push(dir)
  return join(dir, 'session.log')
}

function buildInput(overrides: Partial<EnsureGstackInput> = {}): EnsureGstackInput {
  return {
    repoRoot: '/tmp/repo',
    installRoot: '/fake/gstack',
    codexConfigPath: '/fake-home/.codex/config.toml',
    codexSkillsRoot: '/fake-home/.codex/skills',
    options: { overwrite: false, dryRun: false },
    env: createFakeEnv(),
    sessionLogPath: makeSessionLogPath(),
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('ensureGstack', () => {
  it('returns gstack-updated and skips codex when codex is not detected', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => false,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: {
        kind: 'gstack-codex-skipped',
        reason: 'not-detected',
        skillsRoot: '/fake-home/.codex/skills',
      },
    })
    expect(spawn).toHaveBeenNthCalledWith(1, 'git', ['pull', '--ff-only', 'origin', 'main'], {
      cwd: '/fake/gstack',
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    expect(spawn).toHaveBeenNthCalledWith(2, './setup', ['--team', '--quiet'], {
      cwd: '/fake/gstack',
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  })

  it('returns gstack-updated and materializes codex with the default fast host policy when detected', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }, { code: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' ||
        String(target) === '/fake/gstack/.git' ||
        String(target) === '/fake-home/.codex/config.toml',
    )

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => true,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-installed', skillsRoot: '/fake-home/.codex/skills' },
    })
    expect(spawn).toHaveBeenNthCalledWith(3, './setup', ['--host', 'codex', '--team', '--quiet'], {
      cwd: '/fake/gstack',
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  })

  it('returns gstack-updated and reports codex updated when codex skills already exist', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }, { code: 0 }])
    const exists = vi.fn((target: string | import('node:buffer').Buffer | URL) => {
      const value = String(target)
      return (
        value === '/fake/gstack/setup' ||
        value === '/fake/gstack/.git' ||
        value === '/fake-home/.codex/config.toml' ||
        value === '/fake-home/.codex/skills/gstack'
      )
    })

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => true,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-updated', skillsRoot: '/fake-home/.codex/skills' },
    })
  })

  it('returns gstack-skipped-dry-run without checking or spawning', async () => {
    const spawn = makeSpawn([])
    const exists = vi.fn(() => false)

    const result = await ensureGstack(
      buildInput({
        options: { overwrite: false, dryRun: true },
        spawn,
        exists,
      }),
    )

    expect(result).toEqual({ kind: 'gstack-skipped-dry-run' })
    expect(spawn).not.toHaveBeenCalled()
    expect(exists).not.toHaveBeenCalled()
  })

  it('uses cached gstack when checkout and requested codex skills already exist', async () => {
    const spawn = makeSpawn([])
    const exists = vi.fn((target: string | import('node:buffer').Buffer | URL) => {
      const value = String(target)
      return (
        value === '/fake/gstack/setup' ||
        value === '/fake/gstack/.git' ||
        value === '/fake-home/.codex/config.toml' ||
        value === '/fake-home/.codex/skills/gstack'
      )
    })

    const result = await ensureGstack(
      buildInput({
        env: {} as NodeJS.ProcessEnv,
        spawn,
        exists,
        detectCodex: () => true,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-already-configured',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-already-configured', skillsRoot: '/fake-home/.codex/skills' },
    })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('treats WP_GSTACK_HOSTS as host selection without disabling the cache', async () => {
    const spawn = makeSpawn([])
    const exists = vi.fn((target: string | import('node:buffer').Buffer | URL) => {
      const value = String(target)
      return (
        value === '/fake/gstack/setup' ||
        value === '/fake/gstack/.git' ||
        value === '/fake-home/.codex/config.toml' ||
        value === '/fake-home/.codex/skills/gstack'
      )
    })

    const result = await ensureGstack(
      buildInput({
        env: { WP_GSTACK_HOSTS: 'codex' } as NodeJS.ProcessEnv,
        spawn,
        exists,
        detectCodex: () => true,
      }),
    )

    expect(result.kind).toBe('gstack-already-configured')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('clones and runs setup --team when missing, then skips codex if not detected', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }])
    const exists = vi.fn(() => false)

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => false,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-installed',
      root: '/fake/gstack',
      codex: {
        kind: 'gstack-codex-skipped',
        reason: 'not-detected',
        skillsRoot: '/fake-home/.codex/skills',
      },
    })
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'git',
      ['clone', '--depth', '1', 'https://github.com/garrytan/gstack.git', '/fake/gstack'],
      {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
  })

  it('returns structured clone failures with reason and log path', async () => {
    const sessionLogPath = makeSessionLogPath()
    const spawn = makeSpawn([{ code: 128 }])
    const exists = vi.fn(() => false)

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        sessionLogPath,
        detectCodex: () => false,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-clone-failed',
      exitCode: 128,
      reason: 'exit-nonzero',
      logPath: sessionLogPath,
    })
    expect(readFileSync(sessionLogPath, 'utf8')).toContain('=== git clone ===')
  })

  it('returns structured pull failures with reason and log path', async () => {
    const sessionLogPath = makeSessionLogPath()
    const spawn = makeSpawn([{ code: 9 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        sessionLogPath,
        detectCodex: () => false,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-pull-failed',
      exitCode: 9,
      reason: 'exit-nonzero',
      logPath: sessionLogPath,
    })
  })

  it('returns structured setup failures with reason and log path', async () => {
    const sessionLogPath = makeSessionLogPath()
    const spawn = makeSpawn([{ code: 0 }, { code: 7 }])
    const exists = vi.fn(() => false)

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        sessionLogPath,
        detectCodex: () => false,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-setup-failed',
      exitCode: 7,
      reason: 'exit-nonzero',
      command: '--team',
      logPath: sessionLogPath,
    })
  })

  it('calls spinner.succeed() for checkout + codex materialization success', async () => {
    const { factory, start, succeed, fail } = makeSpinnerFactory()
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }, { code: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' ||
        String(target) === '/fake/gstack/.git' ||
        String(target) === '/fake-home/.codex/config.toml',
    )

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => true,
        spinnerFactory: factory,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-installed', skillsRoot: '/fake-home/.codex/skills' },
    })
    expect(start).toHaveBeenCalledTimes(1)
    expect(succeed).toHaveBeenCalledTimes(1)
    expect(fail).not.toHaveBeenCalled()
  })

  it('calls spinner.fail() when codex materialization fails', async () => {
    const { factory, start, succeed, fail } = makeSpinnerFactory()
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }, { code: 12 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' ||
        String(target) === '/fake/gstack/.git' ||
        String(target) === '/fake-home/.codex/config.toml',
    )

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => true,
        spinnerFactory: factory,
      }),
    )

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'gstack-setup-failed',
        exitCode: 12,
        reason: 'exit-nonzero',
        command: '--host codex --team',
      }),
    )
    expect(start).toHaveBeenCalledTimes(1)
    expect(succeed).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledTimes(1)
  })

  it('supports full mode via WP_GSTACK_MODE=full', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )
    const env = createFakeEnv()
    env.WP_GSTACK_MODE = 'full'

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => false,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: {
        kind: 'gstack-codex-skipped',
        reason: 'not-detected',
        skillsRoot: '/fake-home/.codex/skills',
      },
    })
    expect(spawn).toHaveBeenNthCalledWith(2, './setup', ['--host', 'auto', '--team', '--quiet'], {
      cwd: '/fake/gstack',
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  })

  it('supports explicit host overrides via WP_GSTACK_HOSTS', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' ||
        String(target) === '/fake/gstack/.git' ||
        String(target) === '/fake-home/.codex/config.toml',
    )
    const env = createFakeEnv()
    env.WP_GSTACK_HOSTS = 'codex'

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => true,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-installed', skillsRoot: '/fake-home/.codex/skills' },
    })
    expect(spawn).toHaveBeenNthCalledWith(2, './setup', ['--host', 'codex', '--team', '--quiet'], {
      cwd: '/fake/gstack',
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  })

  it('treats explicit codex host overrides as requested even when detection is false', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )
    const env = createFakeEnv()
    env.WP_GSTACK_HOSTS = 'codex'

    const result = await ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => false,
      }),
    )

    expect(result).toEqual({
      kind: 'gstack-updated',
      root: '/fake/gstack',
      codex: { kind: 'gstack-codex-installed', skillsRoot: '/fake-home/.codex/skills' },
    })
  })

  it('logs stdout/stderr into the session log by default', async () => {
    const sessionLogPath = makeSessionLogPath()
    const spawn = makeSpawn([{ code: 0, stdout: ['hello\n'], stderr: ['warn\n'] }, { code: 0 }])
    const exists = vi.fn(() => false)

    await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => false,
        sessionLogPath,
      }),
    )

    const content = readFileSync(sessionLogPath, 'utf8')
    expect(content).toContain('hello')
    expect(content).toContain('warn')
    expect(content).toContain('=== git clone ===')
    expect(content).toContain('=== --team ===')
  })

  it('streams child output in verbose mode and keeps tee logs', async () => {
    const sessionLogPath = makeSessionLogPath()
    const spawn = makeSpawn([{ code: 0 }, { code: 0, stdout: ['upstream\n'], stderr: ['err\n'] }])
    const exists = vi.fn(() => false)
    const env = createFakeEnv()
    env.WP_VERBOSE_GSTACK = '1'
    const streamOutput = vi.fn()
    const log = vi.fn()

    await ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => false,
        sessionLogPath,
        streamOutput,
        log,
      }),
    )

    expect(streamOutput).toHaveBeenCalledWith('stdout', 'upstream\n')
    expect(streamOutput).toHaveBeenCalledWith('stderr', 'err\n')
    expect(readFileSync(sessionLogPath, 'utf8')).toContain('upstream')
    expect(log).toHaveBeenCalledWith(`  gstack: session log ${sessionLogPath}`)
  })

  it('resets inactivity timeout on child output', async () => {
    vi.useFakeTimers()

    const spawn = makeSpawn([
      {
        autoClose: false,
        onSpawn: (child) => {
          setTimeout(() => child.stdout.write('tick-1\n'), 900)
          setTimeout(() => child.stdout.write('tick-2\n'), 1_800)
          setTimeout(() => {
            child.stdout.end()
            child.stderr.end()
            child.emit('close', 0, null)
          }, 2_700)
        },
      },
      { code: 0 },
    ])
    const exists = vi.fn(() => false)
    const env = createFakeEnv()
    env.WP_GSTACK_INACTIVITY_MS = '1000'

    const run = ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => false,
      }),
    )

    await vi.advanceTimersByTimeAsync(3_000)
    await expect(run).resolves.toEqual(
      expect.objectContaining({
        kind: 'gstack-installed',
      }),
    )
  })

  it('resets inactivity timeout between phases', async () => {
    vi.useFakeTimers()

    const spawn = makeSpawn([
      {
        autoClose: false,
        onSpawn: (child) => {
          setTimeout(() => {
            child.stdout.end()
            child.stderr.end()
            child.emit('close', 0, null)
          }, 900)
        },
      },
      {
        autoClose: false,
        onSpawn: (child) => {
          setTimeout(() => {
            child.stdout.end()
            child.stderr.end()
            child.emit('close', 0, null)
          }, 900)
        },
      },
    ])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )
    const env = createFakeEnv()
    env.WP_GSTACK_INACTIVITY_MS = '1000'

    const run = ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => false,
      }),
    )

    await vi.advanceTimersByTimeAsync(2_000)
    await expect(run).resolves.toEqual(
      expect.objectContaining({
        kind: 'gstack-updated',
      }),
    )
  })

  it('uses POSIX group TERM then KILL on inactivity timeout', async () => {
    vi.useFakeTimers()

    let spawnedChild: FakeChild | null = null
    const spawn = makeSpawn([
      {
        autoClose: false,
        onSpawn: (child) => {
          spawnedChild = child
        },
      },
    ])
    const exists = vi.fn(() => false)
    const env = createFakeEnv()
    env.WP_GSTACK_INACTIVITY_MS = '1000'
    const processKill = vi.fn((pid: number, signal: NodeJS.Signals) => {
      if (signal === 'SIGKILL' && spawnedChild) {
        queueMicrotask(() => spawnedChild?.emit('close', null, 'SIGKILL'))
      }
    }) as unknown as typeof process.kill

    const run = ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => false,
        processKill,
      }),
    )

    await vi.advanceTimersByTimeAsync(1_000)
    expect(processKill).toHaveBeenCalledWith(-1234, 'SIGTERM')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(processKill).toHaveBeenCalledWith(-1234, 'SIGKILL')
    await expect(run).resolves.toEqual(
      expect.objectContaining({
        kind: 'gstack-clone-failed',
        reason: 'inactivity-timeout',
        timedOutCommand: 'git clone',
      }),
    )
  })

  it('uses Windows best-effort direct-child termination on inactivity timeout', async () => {
    vi.useFakeTimers()

    let spawnedChild: FakeChild | null = null
    const spawn = makeSpawn([
      {
        autoClose: false,
        onSpawn: (child) => {
          spawnedChild = child
        },
        onKill: (_signal, child) => {
          queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
        },
      },
    ])
    const exists = vi.fn(() => false)
    const env = createFakeEnv()
    env.WP_GSTACK_INACTIVITY_MS = '1000'
    const processKill = vi.fn() as unknown as typeof process.kill

    const run = ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => false,
        platform: 'win32',
        processKill,
      }),
    )

    await vi.advanceTimersByTimeAsync(1_000)
    expect(processKill).not.toHaveBeenCalled()
    expect(spawnedChild?.kill).toHaveBeenCalledWith('SIGTERM')
    await expect(run).resolves.toEqual(
      expect.objectContaining({
        kind: 'gstack-clone-failed',
        reason: 'inactivity-timeout',
        timedOutCommand: 'git clone',
      }),
    )
  })

  it('installs temporary signal listeners, cleans them up, and returns an interrupt failure', async () => {
    const signalTarget = new EventEmitter() as unknown as NonNullable<
      EnsureGstackInput['signalTarget']
    > &
      EventEmitter
    let spawnedChild: FakeChild | null = null
    const spawn = makeSpawn([
      {
        autoClose: false,
        onSpawn: (child) => {
          spawnedChild = child
        },
      },
    ])
    const exists = vi.fn(() => false)
    const processKill = vi.fn((pid: number, signal: NodeJS.Signals) => {
      if (signal === 'SIGINT' && spawnedChild) {
        queueMicrotask(() => spawnedChild?.emit('close', null, 'SIGINT'))
      }
    }) as unknown as typeof process.kill

    const run = ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => false,
        signalTarget,
        processKill,
      }),
    )

    await vi.waitFor(() => {
      expect(signalTarget.listenerCount('SIGINT')).toBe(1)
      expect(signalTarget.listenerCount('SIGTERM')).toBe(1)
    })
    signalTarget.emit('SIGINT')

    await expect(run).resolves.toEqual(
      expect.objectContaining({
        kind: 'gstack-clone-failed',
        reason: 'signal-interrupted',
      }),
    )
    expect(processKill).toHaveBeenCalledWith(-1234, 'SIGINT')
    expect(signalTarget.listenerCount('SIGINT')).toBe(0)
    expect(signalTarget.listenerCount('SIGTERM')).toBe(0)
  })

  it('warns that quiet setup can take time and how to surface upstream logs', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )
    const log = vi.fn()

    await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => false,
        log,
      }),
    )

    expect(log).toHaveBeenCalledWith(
      '  gstack: quiet mode can take a few minutes on first run (for example while Playwright Chromium installs); set WP_VERBOSE_GSTACK=1 for upstream logs.',
    )
  })

  it('emits quiet-mode heartbeat lines while a child stays alive without fresh output', async () => {
    vi.useFakeTimers()

    const spawn = makeSpawn([
      {
        autoClose: false,
        onSpawn: (child) => {
          setTimeout(
            () => child.stdout.write('\u001B[2mDownloading Chrome for Testing...\u001B[22m\n'),
            1_100,
          )
          setTimeout(() => {
            child.stdout.end()
            child.stderr.end()
            child.emit('close', 0, null)
          }, 3_200)
        },
      },
      { code: 0 },
    ])
    const exists = vi.fn(() => false)
    const log = vi.fn()

    const run = ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => false,
        log,
        heartbeatIntervalMs: 1_000,
      }),
    )

    await vi.advanceTimersByTimeAsync(3_500)
    await expect(run).resolves.toEqual(
      expect.objectContaining({
        kind: 'gstack-installed',
      }),
    )
    expect(log).toHaveBeenCalledWith(
      '  gstack: still cloning canonical checkout (1.0s elapsed; no child output yet)',
    )
    expect(log).toHaveBeenCalledWith(
      '  gstack: still cloning canonical checkout (3.0s elapsed; last child output 1.9s ago: Downloading Chrome for Testing...)',
    )
  })

  it('does not let quiet-mode heartbeats mask inactivity timeouts', async () => {
    vi.useFakeTimers()

    let spawnedChild: FakeChild | null = null
    const spawn = makeSpawn([
      {
        autoClose: false,
        onSpawn: (child) => {
          spawnedChild = child
        },
      },
    ])
    const exists = vi.fn(() => false)
    const env = createFakeEnv()
    env.WP_GSTACK_INACTIVITY_MS = '1000'
    const log = vi.fn()
    const processKill = vi.fn((pid: number, signal: NodeJS.Signals) => {
      if (pid === -1234 && signal === 'SIGKILL' && spawnedChild) {
        queueMicrotask(() => spawnedChild?.emit('close', null, 'SIGKILL'))
      }
    }) as unknown as typeof process.kill

    const run = ensureGstack(
      buildInput({
        spawn,
        exists,
        env,
        detectCodex: () => false,
        log,
        heartbeatIntervalMs: 300,
        processKill,
      }),
    )

    await vi.advanceTimersByTimeAsync(6_000)
    await expect(run).resolves.toEqual(
      expect.objectContaining({
        kind: 'gstack-clone-failed',
        reason: 'inactivity-timeout',
        timedOutCommand: 'git clone',
      }),
    )
    expect(
      log.mock.calls.some(
        ([message]) =>
          typeof message === 'string' && message.includes('still cloning canonical checkout'),
      ),
    ).toBe(true)
  })

  it('does not print the quiet-mode advisory when WP_VERBOSE_GSTACK=1', async () => {
    const spawn = makeSpawn([{ code: 0 }, { code: 0 }])
    const exists = vi.fn(
      (target: string | import('node:buffer').Buffer | URL) =>
        String(target) === '/fake/gstack/setup' || String(target) === '/fake/gstack/.git',
    )
    const log = vi.fn()
    const env = createFakeEnv()
    env.WP_VERBOSE_GSTACK = '1'

    await ensureGstack(
      buildInput({
        spawn,
        exists,
        detectCodex: () => false,
        env,
        log,
      }),
    )

    expect(log).not.toHaveBeenCalledWith(
      '  gstack: quiet mode can take a few minutes on first run (for example while Playwright Chromium installs); set WP_VERBOSE_GSTACK=1 for upstream logs.',
    )
  })
})
