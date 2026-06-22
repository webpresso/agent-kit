import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { auditGstackCoverage } from './audit-gstack-coverage.js'

describe('auditGstackCoverage', () => {
  it('reports external gstack skills missing from the embedded package', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-gstack-audit-'))
    try {
      mkdirSync(join(root, 'packages', 'gstack', 'skills'), { recursive: true })
      writeFileSync(join(root, 'packages', 'gstack', 'skills', 'qa.md'), '# qa\n')
      const external = join(root, 'external')
      mkdirSync(join(external, 'qa'), { recursive: true })
      writeFileSync(join(external, 'qa', 'SKILL.md'), '# qa\n')
      mkdirSync(join(external, 'browse'), { recursive: true })
      writeFileSync(join(external, 'browse', 'SKILL.md'), '# browse\n')

      const result = auditGstackCoverage({ repoRoot: root, externalRoots: [external] })

      expect(result.ok).toBe(false)
      expect(result.missing).toStrictEqual(['browse'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('passes when all external skills are embedded', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-gstack-audit-'))
    try {
      mkdirSync(join(root, 'packages', 'gstack', 'skills'), { recursive: true })
      writeFileSync(join(root, 'packages', 'gstack', 'skills', 'qa.md'), '# qa\n')
      const external = join(root, 'external')
      mkdirSync(external, { recursive: true })
      writeFileSync(join(external, 'qa.md'), '# qa\n')

      const result = auditGstackCoverage({ repoRoot: root, externalRoots: [external] })

      expect(result.ok).toBe(true)
      expect(result.missing).toStrictEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
