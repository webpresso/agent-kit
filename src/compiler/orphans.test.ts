import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findOrphanedSkills, removeOrphanedSkills } from './orphans.js'

function makeCanonicalSkill(cwd: string, name: string): void {
  mkdirSync(join(cwd, '.agent', 'skills', name), { recursive: true })
  writeFileSync(
    join(cwd, '.agent', 'skills', name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Test\n---\n`,
  )
}

function makeGeneratedSkill(cwd: string, runtimeDir: string, name: string): void {
  mkdirSync(join(cwd, runtimeDir, name), { recursive: true })
  writeFileSync(
    join(cwd, runtimeDir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Generated\n---\n`,
  )
}

describe('findOrphanedSkills', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'ak-orphans-test-'))
    dirs.push(d)
    return d
  }

  it('returns empty array when no generated skill dirs exist', () => {
    const cwd = tmp()
    expect(findOrphanedSkills(cwd)).toStrictEqual([])
  })

  it('returns empty array when generated skills all have canonical sources', () => {
    const cwd = tmp()
    makeCanonicalSkill(cwd, 'debug')
    makeGeneratedSkill(cwd, '.claude/skills', 'debug')

    expect(findOrphanedSkills(cwd)).toStrictEqual([])
  })

  it('returns orphan when generated skill has no canonical source', () => {
    const cwd = tmp()
    // No canonical source — only generated
    makeGeneratedSkill(cwd, '.claude/skills', 'old-skill')

    const orphans = findOrphanedSkills(cwd)
    expect(orphans).toHaveLength(1)
    expect(orphans[0]?.name).toBe('old-skill')
    expect(orphans[0]?.runtimeDir).toBe('.claude/skills')
  })

  it('detects orphans across multiple runtime dirs', () => {
    const cwd = tmp()
    makeGeneratedSkill(cwd, '.claude/skills', 'gone-skill')
    makeGeneratedSkill(cwd, '.agents/skills', 'gone-skill')

    const orphans = findOrphanedSkills(cwd)
    expect(orphans).toHaveLength(2)
    expect(orphans.map((o) => o.runtimeDir).sort()).toStrictEqual([
      '.agents/skills',
      '.claude/skills',
    ])
  })

  it('does not flag canonical-only skill as orphan', () => {
    const cwd = tmp()
    makeCanonicalSkill(cwd, 'review')
    // No generated version

    expect(findOrphanedSkills(cwd)).toStrictEqual([])
  })

  it('is read-only — does not modify any files', () => {
    const cwd = tmp()
    makeGeneratedSkill(cwd, '.claude/skills', 'orphan')
    const skillPath = join(cwd, '.claude', 'skills', 'orphan')

    findOrphanedSkills(cwd)

    expect(existsSync(skillPath)).toBe(true)
  })
})

describe('removeOrphanedSkills', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), 'ak-orphans-remove-test-'))
    dirs.push(d)
    return d
  }

  it('removes orphaned skill directories', async () => {
    const cwd = tmp()
    makeGeneratedSkill(cwd, '.claude/skills', 'old-skill')
    const skillPath = join(cwd, '.claude', 'skills', 'old-skill')
    expect(existsSync(skillPath)).toBe(true)

    const orphans = findOrphanedSkills(cwd)
    await removeOrphanedSkills(orphans, false)

    expect(existsSync(skillPath)).toBe(false)
  })

  it('does not remove anything in dry-run mode', async () => {
    const cwd = tmp()
    makeGeneratedSkill(cwd, '.claude/skills', 'old-skill')
    const skillPath = join(cwd, '.claude', 'skills', 'old-skill')

    const orphans = findOrphanedSkills(cwd)
    await removeOrphanedSkills(orphans, true)

    expect(existsSync(skillPath)).toBe(true)
  })

  it('throws when path contains .agent/skills (canonical source guard)', async () => {
    const cwd = tmp()
    const fakePath = join(cwd, '.agent', 'skills', 'canonical-skill')
    mkdirSync(fakePath, { recursive: true })

    const fakeOrphans = [{ name: 'canonical-skill', path: fakePath, runtimeDir: '.agent/skills' }]

    await expect(removeOrphanedSkills(fakeOrphans, false)).rejects.toThrow(
      'refusing to remove canonical source path',
    )
    expect(existsSync(fakePath)).toBe(true)
  })

  it('no-ops gracefully on empty orphans list', async () => {
    await expect(removeOrphanedSkills([], false)).resolves.toBe(undefined)
  })
})
