import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { stageGstackSkills, validateGstackStagingPolicy } from './stage-gstack-skills.js'

const roots: string[] = []

function fixtureRepo(): string {
  const root = path.join(tmpdir(), `stage-gstack-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  roots.push(root)
  mkdirSync(root, { recursive: true })
  cpSync(path.resolve('packages/gstack'), path.join(root, 'packages/gstack'), { recursive: true, filter: (source) => !source.includes(`${path.sep}node_modules${path.sep}`) && !source.endsWith(`${path.sep}node_modules`) })
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('stageGstackSkills', () => {
  it('copies only allowlisted skills deterministically', () => {
    const root = fixtureRepo()
    const first = stageGstackSkills(root)
    const second = stageGstackSkills(root)

    expect(second).toEqual(first)
    expect(first.staged).toEqual([
      'catalog/agent/skills/claude/SKILL.md',
      'catalog/agent/skills/plan-ceo-review/SKILL.md',
      'catalog/agent/skills/plan-design-review/SKILL.md',
      'catalog/agent/skills/plan-eng-review/SKILL.md',
      'catalog/agent/skills/review/SKILL.md',
    ])
    expect(readFileSync(path.join(root, first.staged[0]!), 'utf8')).toContain('name: claude')
  })

  it('rejects denied paths and missing NOTICE/provenance', () => {
    const root = fixtureRepo()
    mkdirSync(path.join(root, 'packages/gstack/browse/dist'), { recursive: true })
    writeFileSync(path.join(root, 'packages/gstack/browse/dist/app.js'), 'x')
    expect(() => validateGstackStagingPolicy(root)).toThrow(/denied gstack path/)

    rmSync(path.join(root, 'packages/gstack/browse'), { recursive: true, force: true })
    rmSync(path.join(root, 'packages/gstack/NOTICE.gstack.md'))
    expect(() => validateGstackStagingPolicy(root)).toThrow(/missing gstack NOTICE/)
  })

  it('rejects denied heavy-runtime content in staged skills', () => {
    const root = fixtureRepo()
    writeFileSync(
      path.join(root, 'packages/gstack/skills/review.md'),
      `${readFileSync(path.join(root, 'packages/gstack/skills/review.md'), 'utf8')}\nplaywright\n`,
    )
    expect(() => stageGstackSkills(root)).toThrow(/denied gstack content matched playwright/)
  })

  it('counts non-allowlisted source files against the package payload budget', () => {
    const root = fixtureRepo()
    mkdirSync(path.join(root, 'packages/gstack/assets'), { recursive: true })
    writeFileSync(path.join(root, 'packages/gstack/assets/large.txt'), 'x'.repeat(1024))
    const policy = {
      ...JSON.parse(readFileSync(path.join(root, 'packages/gstack/staging/allowlist.json'), 'utf8')),
      sizeBudgetBytes: 512,
    }

    expect(() => validateGstackStagingPolicy(root, policy)).toThrow(/gstack source payload .* exceeds budget/)
  })

})
