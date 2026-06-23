import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { SpinnerFactory } from '../spinner.js'
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
  it('skips rtk init when the RTK hook is already installed', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wp-ensure-rtk-'))
    try {
      mkdirSync(join(repoRoot, '.claude', 'hooks'), { recursive: true })
      writeFileSync(join(repoRoot, '.claude', 'hooks', 'rtk-rewrite.sh'), '#!/bin/sh\n')
      writeFileSync(
        join(repoRoot, '.claude', 'settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: '$CLAUDE_PROJECT_DIR/.claude/hooks/rtk-rewrite.sh' }],
              },
            ],
          },
        }),
      )

      const spawn = makeSpawn([{ status: 0 }])
      const result = ensureRtk({
        repoRoot,
        options: { overwrite: false, dryRun: false },
        spawn,
      })

      expect(result).toEqual({ kind: 'rtk-ok', installed: false })
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(spawn).toHaveBeenCalledWith('rtk', ['--version'], {
        encoding: 'utf8',
        timeout: 3000,
      })
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

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
    expect(spawn).toHaveBeenNthCalledWith(1, 'rtk', ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
    })
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
