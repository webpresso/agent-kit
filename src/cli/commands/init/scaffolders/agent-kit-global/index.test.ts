import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { MergeOptions } from '#cli/commands/init/merge'
import { rootWpSelectorSource } from '../../../../../launcher/root-contract.js'

import { ensureAgentKitGlobal } from './index.js'

const GLOBAL_VP = '/global/bin/vp'

type SpawnReturn = { status: number | null; error?: Error; stdout?: string }

/**
 * Build a spawnSync fake that records every call and answers the `vp --version`
 * probe and the `vp install -g …` command independently.
 */
type ScaffolderSpawn = NonNullable<Parameters<typeof ensureAgentKitGlobal>[0]['spawn']>

function makeSpawn(responses: { probe?: SpawnReturn; install?: SpawnReturn } = {}): {
  spawn: ScaffolderSpawn
  calls: Array<{ cmd: string; args: readonly string[] }>
} {
  const calls: Array<{ cmd: string; args: readonly string[] }> = []
  const spawn = vi.fn((cmd: string, args: readonly string[]) => {
    calls.push({ cmd, args })
    const isProbe = cmd === GLOBAL_VP && args[0] === '--version'
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
      resolveVpCommand: () => GLOBAL_VP,
      argv1: '/Users/me/.vite-plus/bin/wp',
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
      argv1: '/Users/me/.vite-plus/bin/wp',
    })
    expect(result).toStrictEqual({ kind: 'agent-kit-global-skipped-opt-out' })
    expect(calls).toStrictEqual([])
  })

  it('skips inside a package lifecycle environment', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: { npm_lifecycle_event: 'postinstall' },
      argv1: '/Users/me/.vite-plus/bin/wp',
    })
    expect(result).toStrictEqual({ kind: 'agent-kit-global-skipped-package-lifecycle' })
    expect(calls).toStrictEqual([])
  })

  it('skips in explicit source mode so a global install never clobbers source/JIT development', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: { WP_FORCE_SOURCE: '1' },
      argv1: '/Users/dev/repos/webpresso/agent-kit/bin/wp',
    })
    expect(result).toStrictEqual({ kind: 'agent-kit-global-skipped-source-mode' })
    expect(calls).toStrictEqual([])
  })

  it('skips when no global-capable vp is on PATH', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: {},
      resolveVpCommand: () => null,
      argv1: '/Users/me/.vite-plus/bin/wp',
    })
    expect(result.kind).toBe('agent-kit-global-skipped-no-vp')
    expect(calls).toStrictEqual([])
  })

  it('skips the expensive global install when the fresh update cache proves agent-kit is up to date', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-agent-kit-global-current-'))
    const { spawn, calls } = makeSpawn()

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '2.1.1', bin: { wp: 'bin/wp' } })}\n`,
        'utf8',
      )
      writeFileSync(join(root, 'bin', 'wp'), rootWpSelectorSource, 'utf8')

      const result = ensureAgentKitGlobal({
        options: WRITE_OPTIONS,
        spawn,
        env: {},
        resolveVpCommand: () => GLOBAL_VP,
        argv1: join(root, 'bin', 'wp'),
        packageRoot: root,
        readFreshCachedLatest: () => '2.1.1',
      })

      expect(result).toStrictEqual({
        kind: 'agent-kit-global-skipped-up-to-date',
        current: '2.1.1',
        latest: '2.1.1',
        repairedLauncher: join(root, 'bin', 'wp'),
      })
      expect(calls).toStrictEqual([{ cmd: GLOBAL_VP, args: ['--version'] }])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('still refreshes when the fresh update cache reports a newer published version', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-agent-kit-global-stale-'))
    const { spawn, calls } = makeSpawn()

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', version: '2.1.0', bin: { wp: 'bin/wp' } })}\n`,
        'utf8',
      )
      writeFileSync(join(root, 'bin', 'wp'), rootWpSelectorSource, 'utf8')

      const result = ensureAgentKitGlobal({
        options: WRITE_OPTIONS,
        spawn,
        env: {},
        resolveVpCommand: () => GLOBAL_VP,
        argv1: join(root, 'bin', 'wp'),
        packageRoot: root,
        readFreshCachedLatest: () => '2.1.1',
      })

      expect(result).toStrictEqual({
        kind: 'agent-kit-global-updated',
        command: [GLOBAL_VP, 'install', '-g', '@webpresso/agent-kit'],
        repairedLauncher: join(root, 'bin', 'wp'),
      })
      expect(calls).toStrictEqual([
        { cmd: GLOBAL_VP, args: ['--version'] },
        { cmd: GLOBAL_VP, args: ['install', '-g', '@webpresso/agent-kit'] },
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('fails loudly when install succeeds but no package root can be resolved for launcher repair', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: {},
      resolveVpCommand: () => GLOBAL_VP,
      argv1: '/Users/me/.vite-plus/bin/wp',
      resolvePackageRootForStaging: () => null,
    })
    expect(result).toStrictEqual({
      kind: 'agent-kit-global-repair-failed',
      reason: 'could not resolve the owning @webpresso/agent-kit package root for launcher repair',
      command: [GLOBAL_VP, 'install', '-g', '@webpresso/agent-kit'],
    })
    expect(calls).toStrictEqual([
      { cmd: GLOBAL_VP, args: ['--version'] },
      { cmd: GLOBAL_VP, args: ['install', '-g', '@webpresso/agent-kit'] },
    ])
  })

  it('repairs a mutated root bin/wp back to the JS selector after refresh', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-agent-kit-global-'))
    const { spawn } = makeSpawn()

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', bin: { wp: 'bin/wp' } })}\n`,
        'utf8',
      )
      writeFileSync(join(root, 'bin', 'wp'), '\x7fELFnot-a-selector', 'utf8')

      const result = ensureAgentKitGlobal({
        options: WRITE_OPTIONS,
        spawn,
        env: {},
        resolveVpCommand: () => GLOBAL_VP,
        argv1: join(root, 'bin', 'wp'),
        packageRoot: root,
      })

      expect(result).toStrictEqual({
        kind: 'agent-kit-global-updated',
        command: [GLOBAL_VP, 'install', '-g', '@webpresso/agent-kit'],
        repairedLauncher: join(root, 'bin', 'wp'),
      })
      expect(existsSync(join(root, 'bin', 'wp'))).toBe(true)
      expect(readFileSync(join(root, 'bin', 'wp'), 'utf8')).toBe(rootWpSelectorSource)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('uses the package-root fallback when argv1 does not map back to the owning package', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-agent-kit-global-fallback-'))
    const { spawn } = makeSpawn()

    try {
      mkdirSync(join(root, 'bin'), { recursive: true })
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', bin: { wp: 'bin/wp' } })}\n`,
        'utf8',
      )
      writeFileSync(join(root, 'bin', 'wp'), 'native-ish', 'utf8')

      const result = ensureAgentKitGlobal({
        options: WRITE_OPTIONS,
        spawn,
        env: {},
        resolveVpCommand: () => GLOBAL_VP,
        argv1: '/Users/me/.vite-plus/bin/wp',
        resolvePackageRootForStaging: () => root,
      })

      expect(result).toStrictEqual({
        kind: 'agent-kit-global-updated',
        command: [GLOBAL_VP, 'install', '-g', '@webpresso/agent-kit'],
        repairedLauncher: join(root, 'bin', 'wp'),
      })
      expect(readFileSync(join(root, 'bin', 'wp'), 'utf8')).toBe(rootWpSelectorSource)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('fails loudly when root bin/wp cannot be rewritten as a regular file', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-agent-kit-global-launcher-dir-'))
    const { spawn } = makeSpawn()

    try {
      mkdirSync(join(root, 'bin', 'wp'), { recursive: true })
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', bin: { wp: 'bin/wp' } })}\n`,
        'utf8',
      )

      const result = ensureAgentKitGlobal({
        options: WRITE_OPTIONS,
        spawn,
        env: {},
        resolveVpCommand: () => GLOBAL_VP,
        argv1: '/Users/me/.vite-plus/bin/wp',
        resolvePackageRootForStaging: () => root,
      })

      expect(result).toStrictEqual({
        kind: 'agent-kit-global-repair-failed',
        reason: expect.stringContaining('EISDIR'),
        command: [GLOBAL_VP, 'install', '-g', '@webpresso/agent-kit'],
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('reports failure (non-fatal) when the install command exits non-zero', () => {
    const { spawn } = makeSpawn({ install: { status: 1 } })
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: {},
      resolveVpCommand: () => GLOBAL_VP,
      argv1: '/Users/me/.vite-plus/bin/wp',
      readFreshCachedLatest: () => null,
    })
    expect(result).toStrictEqual({
      kind: 'agent-kit-global-failed',
      exitCode: 1,
      command: [GLOBAL_VP, 'install', '-g', '@webpresso/agent-kit'],
    })
  })
})
