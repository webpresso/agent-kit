import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hashAgentDir } from '../cli/commands/compile.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ak-orchestrator-test-'))
}

function writeSkill(agentDir: string, name: string, content = `---\nname: ${name}\ndescription: Test skill\n---\n# ${name}\n`): void {
  mkdirSync(join(agentDir, 'skills', name), { recursive: true })
  writeFileSync(join(agentDir, 'skills', name, 'SKILL.md'), content)
}

function writeRule(agentDir: string, name: string, content = `# Rule ${name}\nDo something.`): void {
  mkdirSync(join(agentDir, 'rules'), { recursive: true })
  writeFileSync(join(agentDir, 'rules', `${name}.md`), content)
}

// ---------------------------------------------------------------------------
// hashAgentDir tests
// ---------------------------------------------------------------------------

describe('hashAgentDir', () => {
  let dirs: string[] = []

  beforeEach(() => { dirs = [] })
  afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

  function tmp(): string {
    const d = makeTmpDir()
    dirs.push(d)
    return d
  }

  it('returns a 64-char hex string (SHA-256)', () => {
    const agentDir = tmp()
    const h = hashAgentDir(agentDir)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns consistent hash for identical content (idempotent)', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug')
    writeRule(agentDir, 'no-any')

    const h1 = hashAgentDir(agentDir)
    const h2 = hashAgentDir(agentDir)
    expect(h1).toBe(h2)
  })

  it('returns same hash for two dirs with identical .md content', () => {
    const dir1 = tmp()
    const dir2 = tmp()
    const content = '---\nname: test\ndescription: same\n---\n# Test\n'
    writeSkill(dir1, 'alpha', content)
    writeSkill(dir2, 'alpha', content)

    expect(hashAgentDir(dir1)).toBe(hashAgentDir(dir2))
  })

  it('returns different hash after a file is modified', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug', '---\nname: debug\ndescription: original\n---\n')

    const before = hashAgentDir(agentDir)

    writeSkill(agentDir, 'debug', '---\nname: debug\ndescription: changed\n---\n')
    const after = hashAgentDir(agentDir)

    expect(before).not.toBe(after)
  })

  it('returns different hash after a new file is added', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug')

    const before = hashAgentDir(agentDir)

    writeSkill(agentDir, 'review')
    const after = hashAgentDir(agentDir)

    expect(before).not.toBe(after)
  })

  it('ignores non-.md files — adding a .ts file does not change hash', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug')

    const before = hashAgentDir(agentDir)

    // Write a non-.md file
    writeFileSync(join(agentDir, 'ignored.ts'), 'export const x = 1')
    const after = hashAgentDir(agentDir)

    expect(before).toBe(after)
  })

  it('empty dir produces a stable (non-empty) hash string', () => {
    const agentDir = tmp()
    const h = hashAgentDir(agentDir)
    expect(typeof h).toBe('string')
    expect(h.length).toBe(64)
  })

  it('non-existent dir produces the same stable hash as an empty dir', () => {
    const agentDir = tmp()
    const nonExistent = join(agentDir, 'does-not-exist')
    const emptyDir = tmp()

    expect(hashAgentDir(nonExistent)).toBe(hashAgentDir(emptyDir))
  })
})

// ---------------------------------------------------------------------------
// Idempotency logic: same source → no-op; changed source → recompiles
// ---------------------------------------------------------------------------

describe('compile idempotency via manifest sourceHash', () => {
  let dirs: string[] = []

  beforeEach(() => { dirs = [] })
  afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

  function tmp(): string {
    const d = makeTmpDir()
    dirs.push(d)
    return d
  }

  function makeManifest(sourceHash: string): string {
    return JSON.stringify({
      version: 1,
      timestamp: new Date().toISOString(),
      sourceHash,
      outputHashes: {},
    })
  }

  it('stored manifest sourceHash matches → detected as no-op', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug')

    const currentHash = hashAgentDir(agentDir)
    const manifestPath = join(agentDir, '.compile-manifest.json')
    writeFileSync(manifestPath, makeManifest(currentHash))

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { sourceHash: string }
    const recomputedHash = hashAgentDir(agentDir)

    expect(manifest.sourceHash).toBe(recomputedHash)
  })

  it('stored manifest sourceHash differs → detected as needing recompile', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug', '---\nname: debug\ndescription: v1\n---\n')

    const oldHash = hashAgentDir(agentDir)
    const manifestPath = join(agentDir, '.compile-manifest.json')
    writeFileSync(manifestPath, makeManifest(oldHash))

    // Mutate source
    writeSkill(agentDir, 'debug', '---\nname: debug\ndescription: v2\n---\n')
    const newHash = hashAgentDir(agentDir)

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { sourceHash: string }
    expect(manifest.sourceHash).not.toBe(newHash)
  })

  it('no manifest present → always recompile (no stored sentinel)', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug')

    const manifestPath = join(agentDir, '.compile-manifest.json')
    expect(existsSync(manifestPath)).toBe(false)
    // Absence of manifest means we cannot confirm no-op; recompile is required
  })

  it('manifest with version field is round-trippable', () => {
    const agentDir = tmp()
    const manifest = {
      version: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      sourceHash: 'abc123',
      outputHashes: {
        'AGENTS.md': 'def456',
        '.claude-plugin/plugin.json': 'ghi789',
      },
    }
    const manifestPath = join(agentDir, '.compile-manifest.json')
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as typeof manifest
    expect(parsed.version).toBe(1)
    expect(parsed.sourceHash).toBe('abc123')
    expect(parsed.outputHashes['AGENTS.md']).toBe('def456')
  })
})
