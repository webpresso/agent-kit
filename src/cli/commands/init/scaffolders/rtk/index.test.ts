import { describe, expect, it, vi } from 'vitest'

import type { SpinnerFactory } from '#cli/commands/init/scaffolders/spinner.js'
import { ensureRtk } from './index.js'

function makeSpawn(behaviors: Array<{ status: number | null; error?: Error }>) {
  let i = 0
  return vi.fn(() => {
    const next = behaviors[i] ?? { status: 0 }
    i += 1
    return {
      status: next.status,
      error: next.error,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      pid: 1,
      output: [],
      signal: null,
    }
  }) as unknown as Parameters<typeof ensureRtk>[0]['spawn']
}

function makeSpinnerFactory(): {
  factory: SpinnerFactory
  start: ReturnType<typeof vi.fn>
  succeed: ReturnType<typeof vi.fn>
  fail: ReturnType<typeof vi.fn>
} {
  const start = vi.fn()
  const succeed = vi.fn()
  const fail = vi.fn()
  const factory: SpinnerFactory = (_text: string) => ({ start, succeed, fail })
  return { factory, start, succeed, fail }
}

describe('ensureRtk', () => {
  it('returns rtk-skipped-dry-run without spawning anything', () => {
    const spawn = makeSpawn([])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: true },
      spawn,
    })

    expect(result).toEqual({ kind: 'rtk-skipped-dry-run' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('returns rtk-ok when probe and init both succeed', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result).toEqual({ kind: 'rtk-ok', installed: false })
    expect(spawn).toHaveBeenNthCalledWith(1, 'rtk', ['--version'], { encoding: 'utf8' })
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'rtk',
      ['init', '-g', '--auto-patch'],
      expect.objectContaining({
        cwd: '/tmp/repo',
        stdio: 'inherit',
        env: expect.objectContaining({
          RTK_TELEMETRY_DISABLED: '1',
        }),
      }),
    )
  })

  it('strips host Codex and OMX session env before spawning rtk init', () => {
    const previousCodexThread = process.env['CODEX_THREAD_ID']
    const previousOmxSession = process.env['OMX_SESSION_ID']
    const previousClaudeProjectDir = process.env['CLAUDE_PROJECT_DIR']
    process.env['CODEX_THREAD_ID'] = 'thread-123'
    process.env['OMX_SESSION_ID'] = 'omx-123'
    process.env['CLAUDE_PROJECT_DIR'] = '/tmp/outer-session'

    try {
      const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
      const result = ensureRtk({
        repoRoot: '/tmp/repo',
        options: { overwrite: false, dryRun: false },
        spawn,
      })

      expect(result).toEqual({ kind: 'rtk-ok', installed: false })
      expect(spawn).toHaveBeenNthCalledWith(
        2,
        'rtk',
        ['init', '-g', '--auto-patch'],
        expect.objectContaining({
          env: expect.not.objectContaining({
            CODEX_THREAD_ID: 'thread-123',
            OMX_SESSION_ID: 'omx-123',
            CLAUDE_PROJECT_DIR: '/tmp/outer-session',
          }),
        }),
      )
    } finally {
      if (previousCodexThread === undefined) delete process.env['CODEX_THREAD_ID']
      else process.env['CODEX_THREAD_ID'] = previousCodexThread
      if (previousOmxSession === undefined) delete process.env['OMX_SESSION_ID']
      else process.env['OMX_SESSION_ID'] = previousOmxSession
      if (previousClaudeProjectDir === undefined) delete process.env['CLAUDE_PROJECT_DIR']
      else process.env['CLAUDE_PROJECT_DIR'] = previousClaudeProjectDir
    }
  })

  it('installs with brew on macOS when rtk is not on PATH', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 0 },
      { status: 0 },
      { status: 0 },
    ])

    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result).toEqual({ kind: 'rtk-ok', installed: true })
    expect(spawn).toHaveBeenNthCalledWith(2, 'brew', ['install', 'rtk'], {
      stdio: 'inherit',
    })
    platform.mockRestore()
  })

  it('returns rtk-not-found when brew install fails', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 1 },
    ])

    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result.kind).toBe('rtk-not-found')
    if (result.kind === 'rtk-not-found') {
      expect(result.hint).toContain('brew install rtk')
    }
    platform.mockRestore()
  })

  it('returns rtk-not-found on non-macOS without attempting brew', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
    ])

    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result.kind).toBe('rtk-not-found')
    expect(spawn).toHaveBeenCalledTimes(1)
    platform.mockRestore()
  })

  it('returns rtk-init-failed when init exits non-zero', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 9 }])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result).toEqual({ kind: 'rtk-init-failed', exitCode: 9 })
  })

  it('calls spinner.start() then spinner.succeed() on success', () => {
    const { factory, start, succeed, fail } = makeSpinnerFactory()
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
      spinnerFactory: factory,
    })

    expect(result.kind).toBe('rtk-ok')
    expect(start).toHaveBeenCalledTimes(1)
    expect(succeed).toHaveBeenCalledTimes(1)
    expect(fail).not.toHaveBeenCalled()
  })

  it('calls spinner.fail() when init exits non-zero', () => {
    const { factory, start, succeed, fail } = makeSpinnerFactory()
    const spawn = makeSpawn([{ status: 0 }, { status: 1 }])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
      spinnerFactory: factory,
    })

    expect(result.kind).toBe('rtk-init-failed')
    expect(start).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledTimes(1)
    expect(succeed).not.toHaveBeenCalled()
  })

  it('uses noop spinner (no real ora) when spinnerFactory is not provided', () => {
    // Verify that no real ora is invoked — the noop factory is used by default.
    // If ora were called it would error in a non-TTY test environment.
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureRtk({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })

    expect(result.kind).toBe('rtk-ok')
  })
})
