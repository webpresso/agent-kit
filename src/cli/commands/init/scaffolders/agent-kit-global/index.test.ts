import { describe, expect, it, vi } from 'vitest'

import type { MergeOptions } from '#cli/commands/init/merge'

import { ensureAgentKitGlobal } from './index.js'

type SpawnReturn = { status: number | null; error?: Error; stdout?: string }

/**
 * Build a spawnSync fake that records every call and answers the `vp --version`
 * probe and the `vp install -g …` command independently.
 */
type ScaffolderSpawn = NonNullable<Parameters<typeof ensureAgentKitGlobal>[0]['spawn']>

function makeSpawn(
  responses: { probe?: SpawnReturn; install?: SpawnReturn } = {},
): {
  spawn: ScaffolderSpawn
  calls: Array<{ cmd: string; args: readonly string[] }>
} {
  const calls: Array<{ cmd: string; args: readonly string[] }> = []
  const spawn = vi.fn((cmd: string, args: readonly string[]) => {
    calls.push({ cmd, args })
    const isProbe = cmd === 'vp' && args[0] === '--version'
    if (isProbe) return responses.probe ?? { status: 0, stdout: '1.0.0' }
    return responses.install ?? { status: 0 }
  }) as unknown as ScaffolderSpawn
  return { spawn, calls }
}

const WRITE_OPTIONS: MergeOptions = { overwrite: false, dryRun: false }

describe('ensureAgentKitGlobal', () => {
  it('skips on --dry-run without spawning anything', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: { overwrite: false, dryRun: true },
      spawn,
      env: {},
      argv1: '/usr/local/bin/wp',
      detectGit: () => null,
    })
    expect(result).toStrictEqual({ kind: 'agent-kit-global-skipped-dry-run' })
    expect(calls).toStrictEqual([])
  })

  it('skips when WP_SKIP_AUTO_INSTALL=1 (documented opt-out)', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: { WP_SKIP_AUTO_INSTALL: '1' },
      argv1: '/usr/local/bin/wp',
      detectGit: () => null,
    })
    expect(result).toStrictEqual({ kind: 'agent-kit-global-skipped-opt-out' })
    expect(calls).toStrictEqual([])
  })

  it('skips on a source/git clone so a global install never clobbers a dev checkout', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: {},
      argv1: '/Users/dev/repos/webpresso/agent-kit/bin/wp.js',
      detectGit: () => '/Users/dev/repos/webpresso/agent-kit',
    })
    expect(result).toStrictEqual({
      kind: 'agent-kit-global-skipped-source-clone',
      repoRoot: '/Users/dev/repos/webpresso/agent-kit',
    })
    expect(calls).toStrictEqual([])
  })

  it('skips when vp is not on PATH', () => {
    const { spawn, calls } = makeSpawn({ probe: { status: null, error: new Error('ENOENT') } })
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: {},
      argv1: '/usr/local/bin/wp',
      detectGit: () => null,
    })
    expect(result.kind).toBe('agent-kit-global-skipped-no-vp')
    // Only the probe ran; no install attempted.
    expect(calls).toStrictEqual([{ cmd: 'vp', args: ['--version'] }])
  })

  it('refreshes the global install via the canonical vp install -g command', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: {},
      argv1: '/usr/local/bin/wp',
      detectGit: () => null,
    })
    expect(result).toStrictEqual({
      kind: 'agent-kit-global-updated',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
    expect(calls).toStrictEqual([
      { cmd: 'vp', args: ['--version'] },
      { cmd: 'vp', args: ['install', '-g', '@webpresso/agent-kit'] },
    ])
  })

  it('reports failure (non-fatal) when the install command exits non-zero', () => {
    const { spawn } = makeSpawn({ install: { status: 1 } })
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: {},
      argv1: '/usr/local/bin/wp',
      detectGit: () => null,
    })
    expect(result).toStrictEqual({
      kind: 'agent-kit-global-failed',
      exitCode: 1,
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
  })
})
