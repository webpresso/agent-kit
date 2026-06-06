import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

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
      argv1: '/Users/dev/repos/webpresso/agent-kit/bin/wp',
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

  it('fails loudly when install succeeds but no staging root can be resolved', () => {
    const { spawn, calls } = makeSpawn()
    const result = ensureAgentKitGlobal({
      options: WRITE_OPTIONS,
      spawn,
      env: {},
      argv1: '/usr/local/bin/wp',
      detectGit: () => null,
      resolvePackageRootForStaging: () => null,
    })
    expect(result).toStrictEqual({
      kind: 'agent-kit-global-staging-failed',
      reason: 'could not resolve the owning @webpresso/agent-kit package root for staging',
      command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
    })
    expect(calls).toStrictEqual([
      { cmd: 'vp', args: ['--version'] },
      { cmd: 'vp', args: ['install', '-g', '@webpresso/agent-kit'] },
    ])
  })

  it('stages the host runtime binary to a real plugin-root bin/wp file after refresh', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-agent-kit-global-'))
    const hostTarget =
      process.platform === 'win32'
        ? { id: 'windows-x64', os: 'win32', cpu: 'x64' }
        : { id: `${process.platform}-${process.arch}`, os: process.platform, cpu: process.arch }
    const binaryName = hostTarget.os === 'win32' ? 'wp.exe' : 'wp'
    const runtimePath = join(root, 'bin', 'runtime', hostTarget.id, binaryName)
    const { spawn } = makeSpawn()

    try {
      mkdirSync(dirname(runtimePath), { recursive: true })
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit' })}\n`,
        'utf8',
      )
      writeFileSync(
        join(root, 'bin', 'runtime-manifest.json'),
        `${JSON.stringify({
          binaryName: 'wp',
          targets: [
            {
              ...hostTarget,
              packageName: `@webpresso/agent-kit-runtime-${hostTarget.id}`,
            },
          ],
        })}\n`,
        'utf8',
      )
      writeFileSync(runtimePath, `native:${hostTarget.id}`, 'utf8')

      const result = ensureAgentKitGlobal({
        options: WRITE_OPTIONS,
        spawn,
        env: {},
        argv1: join(root, 'bin', 'wp.js'),
        detectGit: () => null,
        packageRoot: root,
      })

      expect(result).toStrictEqual({
        kind: 'agent-kit-global-updated',
        command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
        stagedBin: join(root, 'bin', 'wp'),
      })
      expect(existsSync(join(root, 'bin', 'wp'))).toBe(true)
      expect(readFileSync(join(root, 'bin', 'wp'), 'utf8')).toBe(`native:${hostTarget.id}`)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('uses the staging-root fallback when argv1 does not map back to the owning package', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-agent-kit-global-fallback-'))
    const hostTarget =
      process.platform === 'win32'
        ? { id: 'windows-x64', os: 'win32', cpu: 'x64' }
        : { id: `${process.platform}-${process.arch}`, os: process.platform, cpu: process.arch }
    const binaryName = hostTarget.os === 'win32' ? 'wp.exe' : 'wp'
    const runtimePath = join(root, 'bin', 'runtime', hostTarget.id, binaryName)
    const { spawn } = makeSpawn()

    try {
      mkdirSync(dirname(runtimePath), { recursive: true })
      writeFileSync(
        join(root, 'package.json'),
        `${JSON.stringify({ name: '@webpresso/agent-kit', bin: { wp: 'bin/wp' } })}\n`,
        'utf8',
      )
      writeFileSync(
        join(root, 'bin', 'runtime-manifest.json'),
        `${JSON.stringify({
          binaryName: 'wp',
          targets: [
            {
              ...hostTarget,
              packageName: `@webpresso/agent-kit-runtime-${hostTarget.id}`,
            },
          ],
        })}\n`,
        'utf8',
      )
      writeFileSync(runtimePath, `fallback:${hostTarget.id}`, 'utf8')

      const result = ensureAgentKitGlobal({
        options: WRITE_OPTIONS,
        spawn,
        env: {},
        argv1: '/usr/local/bin/wp',
        detectGit: () => null,
        resolvePackageRootForStaging: () => root,
      })

      expect(result).toStrictEqual({
        kind: 'agent-kit-global-updated',
        command: ['vp', 'install', '-g', '@webpresso/agent-kit'],
        stagedBin: join(root, 'bin', 'wp'),
      })
      expect(readFileSync(join(root, 'bin', 'wp'), 'utf8')).toBe(`fallback:${hostTarget.id}`)
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
