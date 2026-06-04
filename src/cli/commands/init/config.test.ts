import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultConfig, mergeConfig, readConfig, writeConfig } from './config.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `wp-init-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('config', () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('readConfig returns null when no file', () => {
    expect(readConfig(dir)).toBeNull()
  })

  it('reads legacy .agent-kitrc.json as a one-way migration source', () => {
    writeFileSync(
      join(dir, '.agent-kitrc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: ['tanstack-query'] },
        hosts: {
          selected: ['codex'],
          requiredCapabilities: ['verify'],
        },
        rules: { overrides: ['repo-restrictions'] },
        scripts: { 'setup-agent': 'wp setup' },
        durablePlanningRoot: '.agent/planning/',
        blueprintsDir: 'plans',
        globalInstall: true,
      }),
    )

    expect(readConfig(dir)).toEqual({
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      hosts: {
        selected: ['codex'],
        requiredCapabilities: ['verify'],
      },
      rules: { overrides: ['repo-restrictions'] },
      scripts: { 'setup-agent': 'wp setup' },
      durablePlanningRoot: '.agent/planning/',
      blueprintsDir: 'plans',
      globalInstall: true,
    })
  })

  it('writeConfig + readConfig round-trip', () => {
    const cfg = {
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      mcp: { serverName: 'webpresso', toolPrefix: 'wp_' },
      rules: { overrides: ['repo-restrictions'] },
      scripts: { 'setup-agent': 'vp exec wp setup' },
    }
    writeConfig(dir, cfg)
    expect(existsSync(join(dir, '.webpressorc.json'))).toBe(true)
    const readBack = readConfig(dir)
    expect(readBack?.installed.tier3Skills).toEqual(['tanstack-query'])
    expect(readBack?.mcp).toEqual({ serverName: 'webpresso', toolPrefix: 'wp_' })
    expect(readBack?.rules.overrides).toEqual(['repo-restrictions'])
    expect(readBack?.scripts['setup-agent']).toBe('vp exec wp setup')
  })

  it('mergeConfig unions allowlists and tolerates optional legacy lastInit', () => {
    const existing = {
      ...defaultConfig(),
      installed: { tier3Skills: ['react-doctor'] },
      mcp: { serverName: 'webpresso', toolPrefix: 'wp_' },
      rules: { overrides: ['agent-hooks'] },
      scripts: { 'setup-agent': 'wp setup' },
    }
    const incoming = {
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      mcp: { serverName: 'custom-server' },
      rules: { overrides: ['claude-rules'] },
      scripts: { 'setup-agent': 'vp exec wp setup' },
      lastInit: '2026-04-22T00:00:00Z',
    }
    const merged = mergeConfig(existing, incoming)
    expect(merged.installed.tier3Skills.toSorted()).toEqual(['react-doctor', 'tanstack-query'])
    expect(merged.mcp).toEqual({ serverName: 'custom-server', toolPrefix: 'wp_' })
    expect(merged.rules.overrides).toEqual(['agent-hooks', 'claude-rules'])
    expect(merged.scripts['setup-agent']).toBe('vp exec wp setup')
    expect(merged.lastInit).toBe('2026-04-22T00:00:00Z')
  })

  it('readConfig defaults new override buckets when missing or malformed', () => {
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: ['tanstack-query'] },
        mcp: { serverName: 42, toolPrefix: ['bad'] },
        rules: { overrides: ['valid', 42] },
        scripts: { 'setup-agent': ['bad'] },
      }),
    )

    expect(readConfig(dir)).toEqual({
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      rules: { overrides: ['valid'] },
    })
  })

  it('readConfig defaults mcp when absent', () => {
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: ['tanstack-query'] },
      }),
    )

    expect(readConfig(dir)).toEqual({
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
    })
  })

  it('readConfig tolerates malformed files', () => {
    writeFileSync(join(dir, '.webpressorc.json'), '{not json')
    expect(readConfig(dir)).toBeNull()
  })

  it('readConfig parses guard.packageManager and scriptRoutes, dropping invalid entries', () => {
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        guard: {
          packageManager: 'vp-only',
          scriptRoutes: { 'docs:check': 'docs-frontmatter', bad: 42 },
        },
      }),
    )
    expect(readConfig(dir)?.guard).toEqual({
      packageManager: 'vp-only',
      scriptRoutes: { 'docs:check': 'docs-frontmatter' },
    })
  })

  it('readConfig parses audit.toolchainIsolation.allowDependencies, dropping invalid values', () => {
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        audit: {
          toolchainIsolation: {
            allowDependencies: ['tsx', 42, ''],
          },
        },
      }),
    )

    expect(readConfig(dir)?.audit).toEqual({
      toolchainIsolation: {
        allowDependencies: ['tsx'],
      },
    })
  })

  it('readConfig omits audit when allowDependencies is empty or absent', () => {
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        audit: { toolchainIsolation: { allowDependencies: [] } },
      }),
    )

    expect(readConfig(dir)).toEqual(defaultConfig())
  })

  it('readConfig omits guard when absent or invalid', () => {
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        guard: { packageManager: 'bogus', scriptRoutes: {} },
      }),
    )
    expect(readConfig(dir)).toEqual(defaultConfig())
  })

  it('mergeConfig unions guard.scriptRoutes and overrides packageManager', () => {
    const existing = {
      ...defaultConfig(),
      guard: { scriptRoutes: { 'docs:check': 'docs-frontmatter' } },
    }
    const incoming = {
      ...defaultConfig(),
      guard: {
        packageManager: 'vp-only' as const,
        scriptRoutes: { 'verify:paths': 'absolute-path-policy' },
      },
    }
    expect(mergeConfig(existing, incoming).guard).toEqual({
      packageManager: 'vp-only',
      scriptRoutes: {
        'docs:check': 'docs-frontmatter',
        'verify:paths': 'absolute-path-policy',
      },
    })
  })

  it('mergeConfig unions audit.toolchainIsolation.allowDependencies', () => {
    const existing = {
      ...defaultConfig(),
      audit: { toolchainIsolation: { allowDependencies: ['tsx'] } },
    }
    const incoming = {
      ...defaultConfig(),
      audit: { toolchainIsolation: { allowDependencies: ['@playwright/test'] } },
    }

    expect(mergeConfig(existing, incoming).audit).toEqual({
      toolchainIsolation: { allowDependencies: ['@playwright/test', 'tsx'] },
    })
  })
})
