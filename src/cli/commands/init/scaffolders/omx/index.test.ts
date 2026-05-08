import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { ensureOmx, migrateDeprecatedCodexHooksFeatureFlag } from './index.js'

function makeSpawn(behaviors: Array<{ status: number | null; error?: Error }>) {
  let i = 0
  return vi.fn(() => {
    const next = behaviors[i] ?? { status: 0 }
    i++
    return {
      status: next.status,
      error: next.error,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      pid: 1,
      output: [],
      signal: null,
    }
  }) as unknown as Parameters<typeof ensureOmx>[0]['spawn']
}

describe('ensureOmx', () => {
  it('returns omx-ok when probe and setup both succeed', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-ok', installed: false })
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('returns omx-skipped-dry-run without spawning anything', () => {
    const spawn = makeSpawn([])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: true },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-skipped-dry-run' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('installs oh-my-codex when omx is not on PATH, then runs setup', () => {
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 0 },
      { status: 0 },
      { status: 0 },
    ])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-ok', installed: true })
    expect(spawn).toHaveBeenNthCalledWith(2, 'npm', ['install', '-g', 'oh-my-codex'], {
      stdio: 'inherit',
    })
    expect(spawn).toHaveBeenNthCalledWith(4, 'omx', ['setup', '--yes'], {
      cwd: '/tmp/repo',
      stdio: 'inherit',
    })
  })

  it('returns omx-not-found when the fallback install fails', () => {
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 1 },
    ])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result.kind).toBe('omx-not-found')
    if (result.kind === 'omx-not-found') {
      expect(result.hint).toContain('omx (oh-my-codex)')
    }
  })

  it('returns omx-not-found when probe exits non-zero', () => {
    const spawn = makeSpawn([{ status: 127 }, { status: 0 }, { status: 127 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result.kind).toBe('omx-not-found')
  })

  it('returns omx-spawn-failed when setup itself fails', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 2 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-spawn-failed', exitCode: 2 })
  })

  it('passes --yes to the setup invocation', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(spawn).toHaveBeenNthCalledWith(2, 'omx', ['setup', '--yes'], {
      cwd: '/tmp/repo',
      stdio: 'inherit',
    })
  })

  it('migrates deprecated codex_hooks to hooks in the Codex config after omx setup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ak-omx-'))
    const configPath = join(dir, 'config.toml')
    writeFileSync(
      configPath,
      '[features]\ncodex_hooks = true\ngoals = true\n\n[mcp_servers.playwright]\nenabled = true\n',
      'utf8',
    )

    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
      configPath,
    })

    expect(result).toEqual({ kind: 'omx-ok', installed: false })
    expect(readFileSync(configPath, 'utf8')).toBe(
      '[features]\nhooks = true\ngoals = true\n\n[mcp_servers.playwright]\nenabled = true\n',
    )
  })
})

describe('migrateDeprecatedCodexHooksFeatureFlag', () => {
  it('rewrites codex_hooks to hooks inside the [features] table', () => {
    expect(migrateDeprecatedCodexHooksFeatureFlag('[features]\ncodex_hooks = true\ngoals = true\n')).toBe(
      '[features]\nhooks = true\ngoals = true\n',
    )
  })

  it('removes codex_hooks when hooks already exists and preserves the deprecated value', () => {
    expect(
      migrateDeprecatedCodexHooksFeatureFlag(
        '[features]\nhooks = false\ncodex_hooks = true\ngoals = true\n',
      ),
    ).toBe('[features]\nhooks = true\ngoals = true\n')
  })
})
