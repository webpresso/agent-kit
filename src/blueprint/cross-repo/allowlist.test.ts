import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadAllowlist, bothSidesAllowlist } from './allowlist.js'
import type { AllowlistEntry } from './allowlist.js'

// ---------------------------------------------------------------------------
// Stub git remote so tests never call the real git
// ---------------------------------------------------------------------------

// We mock child_process.execSync to return a predictable org
vi.mock('node:child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('git remote get-url origin')) {
      return 'git@github.com:acme-corp/my-repo.git\n'
    }
    throw new Error('unexpected command')
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAllowYaml(permits: string[]): string {
  if (permits.length === 0) return 'permits: []\n'
  return `permits:\n${permits.map((p) => `  - ${p}`).join('\n')}\n`
}

function allow(source: string, target: string): AllowlistEntry {
  return { source_org: source, permitted_org: target }
}

// ---------------------------------------------------------------------------
// loadAllowlist
// ---------------------------------------------------------------------------

describe('loadAllowlist', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ak-allowlist-test-'))
    mkdirSync(path.join(tmpDir, '.agent'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array when file is missing', () => {
    expect(loadAllowlist(tmpDir)).toStrictEqual([])
  })

  it('returns empty array for empty permits list', () => {
    writeFileSync(path.join(tmpDir, '.agent', 'correlate.allow.yaml'), makeAllowYaml([]))
    expect(loadAllowlist(tmpDir)).toStrictEqual([])
  })

  it('parses single permitted org', () => {
    writeFileSync(path.join(tmpDir, '.agent', 'correlate.allow.yaml'), makeAllowYaml(['other-org']))
    const result = loadAllowlist(tmpDir)
    expect(result).toStrictEqual([allow('acme-corp', 'other-org')])
  })

  it('parses multiple permitted orgs', () => {
    writeFileSync(
      path.join(tmpDir, '.agent', 'correlate.allow.yaml'),
      makeAllowYaml(['trusted-partner', 'random-stranger']),
    )
    const result = loadAllowlist(tmpDir)
    expect(result).toStrictEqual([
      allow('acme-corp', 'trusted-partner'),
      allow('acme-corp', 'random-stranger'),
    ])
  })

  it('returns empty array for invalid YAML', () => {
    writeFileSync(
      path.join(tmpDir, '.agent', 'correlate.allow.yaml'),
      '{ this: is: [invalid yaml\n',
    )
    expect(loadAllowlist(tmpDir)).toStrictEqual([])
  })

  it('returns empty array when file contains null', () => {
    writeFileSync(path.join(tmpDir, '.agent', 'correlate.allow.yaml'), '~\n')
    expect(loadAllowlist(tmpDir)).toStrictEqual([])
  })

  it('returns empty array when schema validation fails (non-array permits)', () => {
    writeFileSync(path.join(tmpDir, '.agent', 'correlate.allow.yaml'), 'permits: "not-an-array"\n')
    expect(loadAllowlist(tmpDir)).toStrictEqual([])
  })
})

// ---------------------------------------------------------------------------
// bothSidesAllowlist
// ---------------------------------------------------------------------------

describe('bothSidesAllowlist', () => {
  it('returns false when empty list', () => {
    expect(bothSidesAllowlist('acme-corp', 'other-org', [])).toBe(false)
  })

  it('returns false with one-side-only entry', () => {
    expect(bothSidesAllowlist('acme-corp', 'other-org', [allow('acme-corp', 'other-org')])).toBe(
      false,
    )
  })

  it('returns true with mutual entries', () => {
    const list = [allow('acme-corp', 'other-org'), allow('other-org', 'acme-corp')]
    expect(bothSidesAllowlist('acme-corp', 'other-org', list)).toBe(true)
  })

  it('4-org fixture: trusted-partner resolves, random-stranger does not', () => {
    const list = [allow('acme-corp', 'trusted-partner'), allow('trusted-partner', 'acme-corp')]
    expect(bothSidesAllowlist('acme-corp', 'trusted-partner', list)).toBe(true)
    expect(bothSidesAllowlist('acme-corp', 'random-stranger', list)).toBe(false)
    expect(bothSidesAllowlist('acme-corp', 'other-org', list)).toBe(false)
  })
})
