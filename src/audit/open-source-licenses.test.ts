import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { auditOpenSourceLicenses } from './open-source-licenses.js'

const repoRoot = join(import.meta.dirname, '..', '..')

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

describe('open-source-licenses audit', () => {
  test('passes for the agent-kit repository', () => {
    const result = auditOpenSourceLicenses(repoRoot)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  }, 60_000)

  test('flags missing root LICENSE and notices files', () => {
    const root = mkdtempSync(join(tmpdir(), 'webpresso-open-source-licenses-'))

    const result = auditOpenSourceLicenses(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'LICENSE' }),
        expect.objectContaining({ file: 'THIRD-PARTY-NOTICES.md' }),
      ]),
    )
  })

  test('flags upstream drift for vendored skills', () => {
    const root = mkdtempSync(join(tmpdir(), 'webpresso-open-source-licenses-'))
    writeFileSync(join(root, 'LICENSE'), 'MIT\n')
    writeFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), '# notices\n')
    writeJson(join(root, 'package.json'), {
      name: '@webpresso/agent-kit',
      version: '0.0.0-test',
      files: ['package.json'],
    })

    const manifestDir = join(root, 'catalog', 'agent', 'skills')
    mkdirSync(manifestDir, { recursive: true })
    writeFileSync(
      join(manifestDir, 'third-party-manifest.json'),
      readFileSync(join(repoRoot, 'catalog/agent/skills/third-party-manifest.json'), 'utf8'),
    )

    const skillDir = join(manifestDir, 'frontend-design')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---
slug: frontend-design
license: Apache-2.0
upstream:
  source: https://example.com/wrong
  last_synced: "2026-05-28"
---
`,
    )
    writeFileSync(join(skillDir, 'LICENSE.txt'), 'Apache-2.0\n')

    const result = auditOpenSourceLicenses(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('must match third-party-manifest.json'),
        }),
      ]),
    )
  })
})
