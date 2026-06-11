/**
 * Unified rule + skill sync — catalog ∪ consumer projection across IDEs.
 *
 * Fixtures: a fake catalog dir (containing rules + skills) and a fake
 * consumer root (containing agent-rules/ and agent-skills/). The default
 * unified-consumer registry is exercised end-to-end.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runUnifiedSync } from './unified-sync.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `unified-sync-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

interface FixtureRoots {
  catalogDir: string
  consumerRoot: string
}

function setupFixtures(): FixtureRoots {
  const root = makeTempDir()
  const catalogDir = join(root, 'pkg', 'catalog', 'agent')
  const consumerRoot = join(root, 'consumer')
  mkdirSync(catalogDir, { recursive: true })
  mkdirSync(consumerRoot, { recursive: true })
  return { catalogDir, consumerRoot }
}

const RULE_FRONTMATTER = `---
type: rule
slug: SLUG
title: Sample
status: active
scope: repo
description: Sample description
---

Body.
`

describe('runUnifiedSync', () => {
  let catalogDir: string
  let consumerRoot: string

  beforeEach(() => {
    const fx = setupFixtures()
    catalogDir = fx.catalogDir
    consumerRoot = fx.consumerRoot
  })

  afterEach(() => {
    // Walk up to the temp root and clean it.
    const tempRoot = dirname(dirname(dirname(catalogDir)))
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('projects a canonical rule into all rule consumers', () => {
    writeFile(join(catalogDir, 'rules', 'foo.md'), RULE_FRONTMATTER.replace('SLUG', 'foo'))

    const result = runUnifiedSync({ catalogDir, consumerRoot })
    expect(result.fixCount).toBeGreaterThan(0)

    // .agent/rules/foo.md — symlink
    expect(isSymlink(join(consumerRoot, '.agent', 'rules', 'foo.md'))).toBe(true)
    // .cursor/rules/foo.mdc — copied (.mdc extension)
    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'foo.mdc'))).toBe(true)
    expect(isSymlink(join(consumerRoot, '.cursor', 'rules', 'foo.mdc'))).toBe(false)
    // .claude/rules/foo.md — symlinked rule
    expect(isSymlink(join(consumerRoot, '.claude', 'rules', 'foo.md'))).toBe(true)
    // Codex skills are discovered from .agents/skills; rules are not projected
    // to unsupported .codex/agents.
    expect(existsSync(join(consumerRoot, '.codex', 'agents', 'foo.md'))).toBe(false)
  })

  it('projects a consumer rule (agent-rules/) alongside catalog rules', () => {
    writeFile(join(catalogDir, 'rules', 'cat.md'), RULE_FRONTMATTER.replace('SLUG', 'cat'))
    writeFile(
      join(consumerRoot, 'agent-rules', 'mine.md'),
      RULE_FRONTMATTER.replace('SLUG', 'mine'),
    )

    runUnifiedSync({ catalogDir, consumerRoot })

    // Both rules land in cursor/.mdc
    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'cat.mdc'))).toBe(true)
    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'mine.mdc'))).toBe(true)
    // No unsupported Codex agents projection.
    expect(existsSync(join(consumerRoot, '.codex', 'agents', 'cat.md'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.codex', 'agents', 'mine.md'))).toBe(false)
  })

  it('projects a consumer skill dir into windsurf (copy), claude (symlink), and portable skills (symlink)', () => {
    writeFile(
      join(consumerRoot, 'agent-skills', 'mine', 'SKILL.md'),
      RULE_FRONTMATTER.replace('SLUG', 'mine').replace('type: rule', 'type: skill'),
    )
    writeFile(join(consumerRoot, 'agent-skills', 'mine', 'asset.txt'), 'hello')

    runUnifiedSync({ catalogDir, consumerRoot })

    // .claude/skills/mine — symlink to dir
    const claudeDir = join(consumerRoot, '.claude', 'skills', 'mine')
    expect(isSymlink(claudeDir)).toBe(true)
    expect(existsSync(join(claudeDir, 'SKILL.md'))).toBe(true)
    expect(readFileSync(join(claudeDir, 'asset.txt'), 'utf8')).toBe('hello')

    // .windsurf/skills/mine — copied dir
    const wsDir = join(consumerRoot, '.windsurf', 'skills', 'mine')
    expect(existsSync(wsDir)).toBe(true)
    expect(isSymlink(wsDir)).toBe(false)
    expect(readFileSync(join(wsDir, 'asset.txt'), 'utf8')).toBe('hello')

    // .agents/skills/mine — portable Codex/OpenCode symlink to dir
    const portableDir = join(consumerRoot, '.agents', 'skills', 'mine')
    expect(isSymlink(portableDir)).toBe(true)
    expect(readFileSync(join(portableDir, 'asset.txt'), 'utf8')).toBe('hello')
  })

  it('prunes per-IDE files when consumer rule is deleted', () => {
    writeFile(
      join(consumerRoot, 'agent-rules', 'gone.md'),
      RULE_FRONTMATTER.replace('SLUG', 'gone'),
    )

    runUnifiedSync({ catalogDir, consumerRoot })
    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'gone.mdc'))).toBe(true)
    expect(existsSync(join(consumerRoot, '.codex', 'agents', 'gone.md'))).toBe(false)

    rmSync(join(consumerRoot, 'agent-rules', 'gone.md'))
    runUnifiedSync({ catalogDir, consumerRoot })

    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'gone.mdc'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.codex', 'agents', 'gone.md'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.agent', 'rules', 'gone.md'))).toBe(false)
  })

  it('is idempotent — second run reports zero writes', () => {
    writeFile(join(catalogDir, 'rules', 'idem.md'), RULE_FRONTMATTER.replace('SLUG', 'idem'))
    writeFile(
      join(consumerRoot, 'agent-skills', 'idem-skill', 'SKILL.md'),
      RULE_FRONTMATTER.replace('SLUG', 'idem-skill').replace('type: rule', 'type: skill'),
    )

    const first = runUnifiedSync({ catalogDir, consumerRoot })
    expect(first.fixCount).toBeGreaterThan(0)

    const second = runUnifiedSync({ catalogDir, consumerRoot })
    expect(second.fixCount).toBe(0)
  })

  it('--check flags drift without writing', () => {
    writeFile(join(catalogDir, 'rules', 'drift.md'), RULE_FRONTMATTER.replace('SLUG', 'drift'))

    const dryFirst = runUnifiedSync({ catalogDir, consumerRoot, check: true })
    expect(dryFirst.fixCount).toBeGreaterThan(0)
    expect(dryFirst.mismatches.length).toBeGreaterThan(0)
    // No writes were made
    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'drift.mdc'))).toBe(false)

    // After a real sync, --check is clean
    runUnifiedSync({ catalogDir, consumerRoot })
    const dryAfter = runUnifiedSync({ catalogDir, consumerRoot, check: true })
    expect(dryAfter.fixCount).toBe(0)

    // Hand-edit the cursor copy: --check fails again
    writeFileSync(join(consumerRoot, '.cursor', 'rules', 'drift.mdc'), 'tampered')
    const dryTampered = runUnifiedSync({ catalogDir, consumerRoot, check: true })
    expect(dryTampered.fixCount).toBeGreaterThan(0)
    expect(dryTampered.mismatches.some((m) => m.targetPath.endsWith('drift.mdc'))).toBe(true)
  })

  it('throws on slug collision between catalog and consumer', () => {
    writeFile(join(catalogDir, 'rules', 'dup.md'), RULE_FRONTMATTER.replace('SLUG', 'dup'))
    writeFile(join(consumerRoot, 'agent-rules', 'dup.md'), RULE_FRONTMATTER.replace('SLUG', 'dup'))

    expect(() => runUnifiedSync({ catalogDir, consumerRoot })).toThrowError(/slug collision/i)
    // No writes happened
    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'dup.mdc'))).toBe(false)
  })

  it('respects --kind rules filter', () => {
    writeFile(join(catalogDir, 'rules', 'r.md'), RULE_FRONTMATTER.replace('SLUG', 'r'))
    writeFile(
      join(catalogDir, 'skills', 's', 'SKILL.md'),
      RULE_FRONTMATTER.replace('SLUG', 's').replace('type: rule', 'type: skill'),
    )

    runUnifiedSync({ catalogDir, consumerRoot, kinds: ['rule'] })

    // Rule projected
    expect(existsSync(join(consumerRoot, '.cursor', 'rules', 'r.mdc'))).toBe(true)
    // Skill NOT projected (filtered out)
    expect(existsSync(join(consumerRoot, '.windsurf', 'skills', 's'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.claude', 'skills', 's'))).toBe(false)
    expect(existsSync(join(consumerRoot, '.agents', 'skills', 's'))).toBe(false)
  })

  it('--kind rules does not prune existing skill projections', () => {
    writeFile(join(catalogDir, 'rules', 'r.md'), RULE_FRONTMATTER.replace('SLUG', 'r'))
    writeFile(
      join(catalogDir, 'skills', 's', 'SKILL.md'),
      RULE_FRONTMATTER.replace('SLUG', 's').replace('type: rule', 'type: skill'),
    )

    runUnifiedSync({ catalogDir, consumerRoot })
    expect(existsSync(join(consumerRoot, '.agents', 'skills', 's'))).toBe(true)

    runUnifiedSync({ catalogDir, consumerRoot, kinds: ['rule'] })

    expect(existsSync(join(consumerRoot, '.agents', 'skills', 's'))).toBe(true)
    expect(existsSync(join(consumerRoot, '.claude', 'skills', 's'))).toBe(true)
  })

  it('catalogDir resolves through a symlink (realpathSync)', () => {
    // Create a symlinked alias to the catalog and pass that to runUnifiedSync.
    const realCatalog = catalogDir
    writeFile(join(realCatalog, 'rules', 'sym.md'), RULE_FRONTMATTER.replace('SLUG', 'sym'))

    const aliasParent = join(dirname(dirname(realCatalog)), 'alias-pkg')
    mkdirSync(join(aliasParent, '..'), { recursive: true })
    symlinkSync(join(realCatalog, '..'), aliasParent, 'dir')
    const aliasCatalog = join(aliasParent, 'agent')

    const result = runUnifiedSync({ catalogDir: aliasCatalog, consumerRoot })
    expect(result.fixCount).toBeGreaterThan(0)

    // Symlink target should resolve to a path that exists (not a stale alias).
    const link = join(consumerRoot, '.agent', 'rules', 'sym.md')
    expect(isSymlink(link)).toBe(true)
    const target = readlinkSync(link)
    expect(existsSync(join(consumerRoot, '.agent', 'rules', target))).toBe(true)
  })
})
