import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const LIVE_SURFACES = [
  'package.json',
  '.claude-plugin/marketplace.json',
  'README.md',
  'docs/cloud-agents.md',
  'docs/skills-catalog.md',
  'catalog/agent/rules/changeset-release.md',
  'catalog/AGENTS.md.tpl',
  '.github/workflows/ci.webpresso.yml',
  'AGENTS.md',
] as const

const BANNED_REFERENCES = [
  'webpresso-agent-kit',
  '/webpresso-agent-kit:',
] as const

describe('webpresso identity scrub', () => {
  it('keeps stale package/plugin/repo identity out of live surfaces', () => {
    const root = process.cwd()

    for (const surface of LIVE_SURFACES) {
      const content = readFileSync(join(root, surface), 'utf8')
      for (const banned of BANNED_REFERENCES) {
        expect(content, `${surface} should not contain ${banned}`).not.toContain(banned)
      }
    }
  })
})
