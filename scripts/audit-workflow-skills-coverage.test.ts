import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { auditWorkflowSkillsCoverage } from './audit-workflow-skills-coverage.js'

function writePolicy(root: string): void {
  mkdirSync(join(root, 'packages', 'workflow-skills', 'staging'), { recursive: true })
  writeFileSync(
    join(root, 'packages', 'workflow-skills', 'staging', 'allowlist.json'),
    JSON.stringify({
      sourceRoot: 'packages/workflow-skills',
      skills: [
        {
          name: 'review',
          source: 'skills/review.md',
          target: 'catalog/agent/skills/review/SKILL.md',
        },
      ],
    }),
  )
}

describe('auditWorkflowSkillsCoverage', () => {
  it('passes when allowlisted source and generated target match', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-workflow-skills-audit-'))
    try {
      writePolicy(root)
      mkdirSync(join(root, 'packages', 'workflow-skills', 'skills'), { recursive: true })
      mkdirSync(join(root, 'catalog', 'agent', 'skills', 'review'), { recursive: true })
      writeFileSync(join(root, 'packages', 'workflow-skills', 'skills', 'review.md'), '# review\n')
      writeFileSync(join(root, 'catalog', 'agent', 'skills', 'review', 'SKILL.md'), '# review\n')

      const result = auditWorkflowSkillsCoverage({ repoRoot: root })

      expect(result.ok).toBe(true)
      expect(result.checked).toStrictEqual(['review'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports stale generated targets', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-workflow-skills-audit-'))
    try {
      writePolicy(root)
      mkdirSync(join(root, 'packages', 'workflow-skills', 'skills'), { recursive: true })
      mkdirSync(join(root, 'catalog', 'agent', 'skills', 'review'), { recursive: true })
      writeFileSync(join(root, 'packages', 'workflow-skills', 'skills', 'review.md'), '# review\n')
      writeFileSync(join(root, 'catalog', 'agent', 'skills', 'review', 'SKILL.md'), '# stale\n')

      const result = auditWorkflowSkillsCoverage({ repoRoot: root })

      expect(result.ok).toBe(false)
      expect(result.staleTargets).toStrictEqual(['review'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
