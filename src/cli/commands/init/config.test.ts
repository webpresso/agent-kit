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
    const cfg = { ...defaultConfig(), installed: { tier3Skills: ['tanstack-query'] } }
    writeConfig(dir, cfg)
    expect(existsSync(join(dir, '.agent-kitrc.json'))).toBe(true)
    const readBack = readConfig(dir)
    expect(readBack?.installed.tier3Skills).toEqual(['tanstack-query'])
  })

  it('mergeConfig unions tier3Skills and keeps latest timestamp', () => {
    const existing = { ...defaultConfig(), installed: { tier3Skills: ['react-doctor'] } }
    const incoming = {
      ...defaultConfig(),
      installed: { tier3Skills: ['tanstack-query'] },
      lastInit: '2026-04-22T00:00:00Z',
    }
    const merged = mergeConfig(existing, incoming)
    expect(merged.installed.tier3Skills.toSorted()).toEqual(['react-doctor', 'tanstack-query'])
    expect(merged.lastInit).toBe('2026-04-22T00:00:00Z')
  })

  it('readConfig tolerates malformed files', () => {
    writeFileSync(join(dir, '.agent-kitrc.json'), '{not json')
    expect(readConfig(dir)).toBeNull()
  })
})
