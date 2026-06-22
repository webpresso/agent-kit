import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('@repo/gstack provenance', () => {
  it('records upstream source, license, imported skills, and excluded payloads', () => {
    const root = path.resolve(import.meta.dirname, '..')
    const provenance = JSON.parse(
      readFileSync(path.join(root, 'provenance/upstream-gstack.json'), 'utf8'),
    ) as {
      upstream: { repository: string; commit: string; version: string; license: string }
      curation: { importedSkills: string[]; excludedPayloads: string[] }
    }
    expect(provenance.upstream.repository).toBe('https://github.com/garrytan/gstack')
    expect(provenance.upstream.commit).toMatch(/^[0-9a-f]{40}$/u)
    expect(provenance.upstream.version).toBeTruthy()
    expect(provenance.upstream.license).toBe('MIT')
    expect(provenance.curation.importedSkills).toEqual([
      'claude',
      'codex',
      'opencode-go',
      'deepseek',
      'glm',
      'kimi',
      'minimax',
      'mimo',
      'qwen',
      'hy3',
      'plan-eng-review',
      'plan-ceo-review',
      'plan-design-review',
      'review',
    ])
    expect(provenance.curation.excludedPayloads.join('\n')).toContain('node_modules')
    expect(readFileSync(path.join(root, 'NOTICE.gstack.md'), 'utf8')).toContain(
      'MIT-licensed gstack',
    )
  })
})
