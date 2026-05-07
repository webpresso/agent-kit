import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditTechDebt } from './tech-debt.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(
    os.tmpdir(),
    `ak-audit-tech-debt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

const VALID_FRONTMATTER = `---
type: tech-debt
status: accepted
severity: medium
category: complexity
review_cadence: quarterly
last_reviewed: '2024-01-01'
linked_blueprints: []
---

# Valid item
`

describe('auditTechDebt', () => {
  it('returns ok with zero violations for empty directory', () => {
    const result = auditTechDebt(tmpDir)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('returns ok for a valid tech-debt file in correct status directory', async () => {
    const acceptedDir = path.join(tmpDir, 'accepted')
    await mkdir(acceptedDir, { recursive: true })
    await writeFile(path.join(acceptedDir, 'h-001-valid.md'), VALID_FRONTMATTER)

    const result = auditTechDebt(tmpDir)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.checked).toBeGreaterThan(0)
  })

  it('reports violation for file in wrong status directory', async () => {
    const resolvedDir = path.join(tmpDir, 'resolved')
    await mkdir(resolvedDir, { recursive: true })
    // File says status: accepted but lives in resolved/
    await writeFile(path.join(resolvedDir, 'h-001-misplaced.md'), VALID_FRONTMATTER)

    const result = auditTechDebt(tmpDir)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v) =>
        /wrong status directory|misplaced|status mismatch/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('reports violation for missing required frontmatter fields', async () => {
    const acceptedDir = path.join(tmpDir, 'accepted')
    await mkdir(acceptedDir, { recursive: true })
    await writeFile(
      path.join(acceptedDir, 'h-001-malformed.md'),
      `---\ntype: tech-debt\nstatus: accepted\n---\n# Missing fields\n`,
    )

    const result = auditTechDebt(tmpDir)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.file?.includes('h-001-malformed'))).toBe(true)
  })

  it('reports violation for invalid severity value', async () => {
    const acceptedDir = path.join(tmpDir, 'accepted')
    await mkdir(acceptedDir, { recursive: true })
    await writeFile(
      path.join(acceptedDir, 'h-001-bad-severity.md'),
      `---\ntype: tech-debt\nstatus: accepted\nseverity: extreme\ncategory: complexity\nreview_cadence: quarterly\nlast_reviewed: '2024-01-01'\n---\n# Bad severity\n`,
    )

    const result = auditTechDebt(tmpDir)
    expect(result.ok).toBe(false)
  })

  it('reports violation for critical severity with non-weekly cadence', async () => {
    const acceptedDir = path.join(tmpDir, 'accepted')
    await mkdir(acceptedDir, { recursive: true })
    await writeFile(
      path.join(acceptedDir, 'h-001-critical-quarterly.md'),
      `---\ntype: tech-debt\nstatus: accepted\nseverity: critical\ncategory: security\nreview_cadence: quarterly\nlast_reviewed: '2024-01-01'\n---\n# Critical with quarterly cadence\n`,
    )

    const result = auditTechDebt(tmpDir)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => /weekly/i.test(v.message))).toBe(true)
  })

  it('passes for critical severity with weekly cadence', async () => {
    const acceptedDir = path.join(tmpDir, 'accepted')
    await mkdir(acceptedDir, { recursive: true })
    await writeFile(
      path.join(acceptedDir, 'h-001-critical-weekly.md'),
      `---\ntype: tech-debt\nstatus: accepted\nseverity: critical\ncategory: security\nreview_cadence: weekly\nlast_reviewed: '2024-01-01'\n---\n# Critical with weekly cadence\n`,
    )

    const result = auditTechDebt(tmpDir)
    expect(result.ok).toBe(true)
  })
})
