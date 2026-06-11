import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditSkillSizes, auditSkillSizesAsRepoResult } from './skill-sizes.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(
    os.tmpdir(),
    `ak-skill-sizes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function createSkillMd(
  skillName: string,
  description: string,
  body = '# Skill\n\nContent.',
): Promise<void> {
  const skillDir = path.join(tmpDir, '.agent', 'skills', skillName)
  await mkdir(skillDir, { recursive: true })
  const frontmatter = ['---', `description: "${description}"`, '---', '', body].join('\n')
  await writeFile(path.join(skillDir, 'SKILL.md'), frontmatter, 'utf8')
}

describe('auditSkillSizes', () => {
  it('returns pass=true when no skills exist', () => {
    const result = auditSkillSizes(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.codexListingTotal).toBe(0)
  })

  it('passes for a small skill description', async () => {
    await createSkillMd('my-skill', 'A short description')
    const result = auditSkillSizes(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.codexListingTotal).toBeGreaterThan(0)
  })

  it('flags description that exceeds claude-skill-description-each budget', async () => {
    // Default budget is 800B for description
    const overSizeDesc = 'x'.repeat(850)
    await createSkillMd('big-desc-skill', overSizeDesc)
    const result = auditSkillSizes(tmpDir)
    const descViolation = result.violations.find((v) => v.kind === 'description-too-large')
    expect(descViolation).not.toBe(undefined)
    expect(descViolation?.bytes).toBeGreaterThan(800)
  })

  it('flags file that exceeds skill-md-total-each budget', async () => {
    // Default budget is 16384B for file total
    const bigBody = 'A'.repeat(17000)
    await createSkillMd('huge-file-skill', 'Short description', bigBody)
    const result = auditSkillSizes(tmpDir)
    const fileViolation = result.violations.find((v) => v.kind === 'file-too-large')
    expect(fileViolation).not.toBe(undefined)
    expect(fileViolation?.bytes).toBeGreaterThan(16384)
  })

  it('flags codex listing total when sum of descriptions exceeds budget', async () => {
    // Default codex budget is 7000B total
    // Create multiple skills with ~500B descriptions each to exceed 7000B
    for (let i = 0; i < 20; i++) {
      await createSkillMd(`skill-${i}`, 'y'.repeat(400))
    }
    const result = auditSkillSizes(tmpDir)
    const listingViolation = result.violations.find(
      (v) => v.kind === 'codex-listing-total-too-large',
    )
    expect(listingViolation).not.toBe(undefined)
    expect(result.codexListingTotal).toBeGreaterThan(7000)
  })

  it('respects custom budgets from .agent/.audit-budgets.yaml', async () => {
    // Set very small budget
    await mkdir(path.join(tmpDir, '.agent'), { recursive: true })
    await writeFile(
      path.join(tmpDir, '.agent', '.audit-budgets.yaml'),
      ['budgets:', '  claude-skill-description-each:', '    max_bytes: 10'].join('\n'),
      'utf8',
    )
    await createSkillMd('my-skill', 'This description is longer than 10 bytes')
    const result = auditSkillSizes(tmpDir)
    expect(result.violations.some((v) => v.kind === 'description-too-large')).toBe(true)
  })

  it('skips SKILL.md when skills dir has no subdirs', async () => {
    // Create the skills dir but no skill subdirs
    await mkdir(path.join(tmpDir, '.agent', 'skills'), { recursive: true })
    const result = auditSkillSizes(tmpDir)
    expect(result.pass).toBe(true)
  })

  it('handles SKILL.md with no description frontmatter', async () => {
    const skillDir = path.join(tmpDir, '.agent', 'skills', 'no-desc-skill')
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, 'SKILL.md'), '# No frontmatter\n\nContent.', 'utf8')
    const result = auditSkillSizes(tmpDir)
    // Should not throw; description bytes = 0, no description violation
    expect(result.pass).toBe(true)
    expect(result.codexListingTotal).toBe(0)
  })
})

describe('auditSkillSizesAsRepoResult', () => {
  it('wraps result in RepoAuditResult shape', async () => {
    await createSkillMd('test-skill', 'Short description')
    const result = auditSkillSizesAsRepoResult(tmpDir)
    expect(result.ok).toBe(true)
    expect(result.title).toBe('Skill sizes audit')
    expect(typeof result.checked).toBe('number')
    expect(Array.isArray(result.violations)).toBe(true)
  })
})
