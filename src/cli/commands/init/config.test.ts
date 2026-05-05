import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultConfig, mergeConfig, readConfig, writeConfig } from './config.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `ak-init-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  it('writeConfig + readConfig round-trip', () => {
    const cfg = {
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      mcp: { serverName: 'agent-kit', toolPrefix: 'ak_' },
      rules: { overrides: ['repo-restrictions'] },
      scripts: { 'setup-agent': 'pnpm exec ak setup' },
    }
    writeConfig(dir, cfg)
    expect(existsSync(join(dir, '.agent-kitrc.json'))).toBe(true)
    const readBack = readConfig(dir)
    expect(readBack?.installed.tier3Skills).toEqual(['tanstack-query'])
    expect(readBack?.mcp).toEqual({ serverName: 'agent-kit', toolPrefix: 'ak_' })
    expect(readBack?.rules.overrides).toEqual(['repo-restrictions'])
    expect(readBack?.scripts['setup-agent']).toBe('pnpm exec ak setup')
  })

  it('mergeConfig unions allowlists and keeps latest timestamp', () => {
    const existing = {
      ...defaultConfig(),
      installed: { tier3Skills: ['react-doctor'] },
      mcp: { serverName: 'agent-kit', toolPrefix: 'ak_' },
      rules: { overrides: ['agent-hooks'] },
      scripts: { 'setup-agent': 'ak setup' },
    }
    const incoming = {
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      mcp: { serverName: 'custom-server' },
      rules: { overrides: ['claude-rules'] },
      scripts: { 'setup-agent': 'pnpm exec ak setup' },
      lastInit: '2026-04-22T00:00:00Z',
    }
    const merged = mergeConfig(existing, incoming)
    expect(merged.installed.tier3Skills.toSorted()).toEqual(['react-doctor', 'tanstack-query'])
    expect(merged.mcp).toEqual({ serverName: 'custom-server', toolPrefix: 'ak_' })
    expect(merged.rules.overrides).toEqual(['agent-hooks', 'claude-rules'])
    expect(merged.scripts['setup-agent']).toBe('pnpm exec ak setup')
    expect(merged.lastInit).toBe('2026-04-22T00:00:00Z')
  })

  it('readConfig defaults new override buckets when missing or malformed', () => {
    writeFileSync(
      join(dir, '.agent-kitrc.json'),
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
      join(dir, '.agent-kitrc.json'),
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
    writeFileSync(join(dir, '.agent-kitrc.json'), '{not json')
    expect(readConfig(dir)).toBeNull()
  })
})
