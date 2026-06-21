import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const EXPECTED_SKILLS = [
  'claude',
  'codex',
  'deepseek',
  'glm',
  'hy3',
  'kimi',
  'mimo',
  'minimax',
  'opencode-go',
  'plan-ceo-review',
  'plan-design-review',
  'plan-eng-review',
  'qwen',
  'review',
]

describe('@repo/gstack staging policy', () => {
  it('allowlists cross-host outside-voice skills and denies heavy/generated payloads', () => {
    const policy = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../staging/allowlist.json'), 'utf8')) as {
      sizeBudgetBytes: number
      skills: Array<{ name: string; source: string; target: string }>
      deniedPathPatterns: string[]
      deniedContentPatterns: string[]
    }
    expect(policy.skills.map((skill) => skill.name).sort()).toEqual(EXPECTED_SKILLS)
    for (const skill of policy.skills) {
      expect(skill.source).toBe(`skills/${skill.name}.md`)
      expect(skill.target).toBe(`catalog/agent/skills/${skill.name}/SKILL.md`)
    }
    expect(policy.sizeBudgetBytes).toBeLessThanOrEqual(125_000)
    expect(policy.deniedPathPatterns).toEqual(expect.arrayContaining(['node_modules/', '.git/', 'browse/dist/', 'design/dist/', 'make-pdf/dist/', '.node']))
    expect(policy.deniedContentPatterns).toEqual(expect.arrayContaining(['playwright', 'puppeteer', 'ngrok', 'html-to-docx']))
  })
})
