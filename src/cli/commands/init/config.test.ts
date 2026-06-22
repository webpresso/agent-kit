import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultConfig, mergeConfig, readConfig, writeConfig } from './config.js'
import { REQUIRED_CORE_CAPABILITIES } from './host-visibility.js'

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

  it('defaults host requiredCapabilities to the shared favorites set', () => {
    expect(defaultConfig().hosts?.requiredCapabilities).toEqual([...REQUIRED_CORE_CAPABILITIES])
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
    })
  })

  it('writeConfig + readConfig round-trip', () => {
    const cfg = {
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      integrations: {
        omx: { enabled: true, scope: 'user' },
        gstack: { enabled: true },
      },
      mcp: { serverName: 'webpresso', toolPrefix: 'wp_' },
      rules: { overrides: ['repo-restrictions'] },
      scripts: { 'setup-agent': 'wp setup' },
      setup: {
        preservePaths: ['VISION.md'],
      },
      generatedCleanup: {
        removePaths: ['scripts/resolve-webpresso-cli-versions.js'],
      },
    }
    writeConfig(dir, cfg)
    expect(existsSync(join(dir, '.webpressorc.json'))).toBe(true)
    const readBack = readConfig(dir)
    expect(readBack?.installed.tier3Skills).toEqual(['tanstack-query'])
    expect(readBack?.integrations).toEqual({
      omx: { enabled: true, scope: 'user' },
      gstack: { enabled: true },
    })
    expect(readBack?.mcp).toEqual({ serverName: 'webpresso', toolPrefix: 'wp_' })
    expect(readBack?.rules.overrides).toEqual(['repo-restrictions'])
    expect(readBack?.scripts['setup-agent']).toBe('wp setup')
    expect(readBack?.setup).toEqual({
      preservePaths: ['VISION.md'],
    })
    expect(readBack?.generatedCleanup).toEqual({
      removePaths: ['scripts/resolve-webpresso-cli-versions.js'],
    })
  })

  it('mergeConfig unions allowlists and tolerates optional legacy lastInit', () => {
    const existing = {
      ...defaultConfig(),
      installed: { tier3Skills: ['react-doctor'] },
      integrations: { omx: { enabled: true, scope: 'user' as const } },
      mcp: { serverName: 'webpresso', toolPrefix: 'wp_' },
      rules: { overrides: ['agent-hooks'] },
      scripts: { 'setup-agent': 'wp setup' },
    }
    const incoming = {
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      integrations: { gstack: { enabled: true as const } },
      mcp: { serverName: 'custom-server' },
      rules: { overrides: ['claude-rules'] },
      scripts: { 'setup-agent': 'wp setup' },
      setup: {
        preservePaths: ['VISION.md'],
      },
      generatedCleanup: {
        removePaths: ['scripts/resolve-webpresso-cli-versions.js'],
      },
      lastInit: '2026-04-22T00:00:00Z',
    }
    const merged = mergeConfig(existing, incoming)
    expect(merged.installed.tier3Skills.toSorted()).toEqual(['react-doctor', 'tanstack-query'])
    expect(merged.integrations).toEqual({ gstack: { enabled: true } })
    expect(merged.mcp).toEqual({ serverName: 'custom-server', toolPrefix: 'wp_' })
    expect(merged.rules.overrides).toEqual(['agent-hooks', 'claude-rules'])
    expect(merged.scripts['setup-agent']).toBe('wp setup')
    expect(merged.setup).toEqual({
      preservePaths: ['VISION.md'],
    })
    expect(merged.generatedCleanup).toEqual({
      removePaths: ['scripts/resolve-webpresso-cli-versions.js'],
    })
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

  it('readConfig parses integrations and drops invalid entries', () => {
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        integrations: {
          omx: { enabled: true, scope: 'project' },
          omc: { enabled: false, scope: 'user' },
          gstack: { enabled: true, scope: 'bogus' },
        },
      }),
    )

    expect(readConfig(dir)?.integrations).toEqual({
      omx: { enabled: true, scope: 'project' },
      gstack: { enabled: true },
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

  it('drops absolute and repo-escaping preserve/remove paths when reading config', () => {
    writeFileSync(
      join(dir, '.webpressorc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        setup: { preservePaths: ['VISION.md', '/tmp/outside.txt', '../escape.txt'] },
        generatedCleanup: {
          removePaths: [
            'scripts/resolve-webpresso-cli-versions.js',
            '/tmp/outside.txt',
            '../escape.txt',
          ],
        },
      }),
    )

    expect(readConfig(dir)?.setup).toEqual({
      preservePaths: ['VISION.md'],
    })
    expect(readConfig(dir)?.generatedCleanup).toEqual({
      removePaths: ['scripts/resolve-webpresso-cli-versions.js'],
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
