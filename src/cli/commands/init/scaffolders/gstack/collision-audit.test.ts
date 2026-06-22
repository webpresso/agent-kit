import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { auditGstackSkillCollisions } from './collision-audit.js'

const roots: string[] = []
function tmpRoot(): string {
  const root = path.join(
    tmpdir(),
    `gstack-collision-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('auditGstackSkillCollisions', () => {
  it('reports Claude and Codex skill paths that would be shadowed', () => {
    const root = tmpRoot()
    const claude = path.join(root, 'claude')
    const codex = path.join(root, 'codex')
    mkdirSync(path.join(claude, 'review'), { recursive: true })
    mkdirSync(path.join(codex, 'plan-eng-review'), { recursive: true })
    writeFileSync(path.join(claude, 'review', 'SKILL.md'), 'third-party review')
    writeFileSync(path.join(codex, 'plan-eng-review', 'SKILL.md'), 'third-party plan')

    expect(
      auditGstackSkillCollisions({ claudeSkillsRoot: claude, codexSkillsRoot: codex }),
    ).toEqual([
      { host: 'claude', name: 'review', path: path.join(claude, 'review', 'SKILL.md') },
      {
        host: 'codex',
        name: 'plan-eng-review',
        path: path.join(codex, 'plan-eng-review', 'SKILL.md'),
      },
    ])
  })

  it('ignores already installed Webpresso-owned staged skills', () => {
    const root = tmpRoot()
    const claude = path.join(root, 'claude')
    const codex = path.join(root, 'codex')
    mkdirSync(path.join(claude, 'review'), { recursive: true })
    writeFileSync(
      path.join(claude, 'review', 'SKILL.md'),
      '<!-- Derived from MIT-licensed gstack workflow ideas; see packages/gstack/NOTICE.gstack.md. -->',
    )

    expect(
      auditGstackSkillCollisions({ claudeSkillsRoot: claude, codexSkillsRoot: codex }),
    ).toEqual([])
  })
})
