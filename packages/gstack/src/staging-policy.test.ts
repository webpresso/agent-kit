import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('@repo/gstack staging policy', () => {
  it('allowlists v1 skills and denies heavy/generated payloads', () => {
    const policy = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../staging/allowlist.json'), 'utf8')) as {
      sizeBudgetBytes: number
      skills: Array<{ name: string }>
      deniedPathPatterns: string[]
      deniedContentPatterns: string[]
    }
    expect(policy.skills.map((skill) => skill.name).sort()).toEqual([
      'claude',
      'plan-ceo-review',
      'plan-design-review',
      'plan-eng-review',
      'review',
    ])
    expect(policy.sizeBudgetBytes).toBeLessThanOrEqual(75_000)
    expect(policy.deniedPathPatterns).toEqual(expect.arrayContaining(['node_modules/', '.git/', 'browse/dist/', 'design/dist/', 'make-pdf/dist/', '.node']))
    expect(policy.deniedContentPatterns).toEqual(expect.arrayContaining(['playwright', 'puppeteer', 'ngrok', 'html-to-docx']))
  })
})
