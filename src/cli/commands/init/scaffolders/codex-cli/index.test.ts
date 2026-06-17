import { describe, expect, it, vi } from 'vitest'

import { ensureCodexCli } from './index.js'

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
  }) as unknown as Parameters<typeof ensureCodexCli>[0]['spawn']
}

describe('ensureCodexCli', () => {
  it('updates Codex through vp when already installed', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureCodexCli({
      options: { overwrite: false, dryRun: false },
      spawn,
      resolveVpCommand: () => 'vp',
    })

    expect(result).toEqual({ kind: 'codex-cli-ok', installed: false })
    expect(spawn).toHaveBeenNthCalledWith(1, 'codex', ['--version'], { encoding: 'utf8' })
    expect(spawn).toHaveBeenNthCalledWith(2, 'vp', ['update', '-g', '--latest', '@openai/codex'], {
      stdio: 'inherit',
    })
  })

  it('installs Codex through vp when missing', () => {
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 0 },
      { status: 0 },
    ])
    const result = ensureCodexCli({
      options: { overwrite: false, dryRun: false },
      spawn,
      resolveVpCommand: () => 'vp',
    })

    expect(result).toEqual({ kind: 'codex-cli-ok', installed: true })
    expect(spawn).toHaveBeenNthCalledWith(2, 'vp', ['install', '-g', '@openai/codex'], {
      stdio: 'inherit',
    })
  })

  it('skips the global Codex refresh when WP_SKIP_UPDATE_CHECK=1', () => {
    const spawn = makeSpawn([{ status: 0 }])
    const previous = process.env.WP_SKIP_UPDATE_CHECK
    process.env.WP_SKIP_UPDATE_CHECK = '1'

    try {
      const result = ensureCodexCli({
        options: { overwrite: false, dryRun: false },
        spawn,
      })

      expect(result).toEqual({ kind: 'codex-cli-ok', installed: false })
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(spawn).toHaveBeenNthCalledWith(1, 'codex', ['--version'], { encoding: 'utf8' })
    } finally {
      if (previous === undefined) delete process.env.WP_SKIP_UPDATE_CHECK
      else process.env.WP_SKIP_UPDATE_CHECK = previous
    }
  })

  it('returns unavailable when install fails', () => {
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 1 },
    ])
    const result = ensureCodexCli({
      options: { overwrite: false, dryRun: false },
      spawn,
      resolveVpCommand: () => 'vp',
    })

    expect(result.kind).toBe('codex-cli-unavailable')
  })



  it('skips global Codex refresh when only a repo-local vp is available', () => {
    const spawn = makeSpawn([{ status: 0 }])
    const result = ensureCodexCli({
      options: { overwrite: false, dryRun: false },
      spawn,
      resolveVpCommand: () => null,
    })

    expect(result).toEqual({ kind: 'codex-cli-ok', installed: false })
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  it('skips work in dry-run mode', () => {
    const spawn = makeSpawn([])
    const result = ensureCodexCli({
      options: { overwrite: false, dryRun: true },
      spawn,
    })

    expect(result).toEqual({ kind: 'codex-cli-skipped-dry-run' })
    expect(spawn).not.toHaveBeenCalled()
  })
})
