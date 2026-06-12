import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { auditOpenSourceLicenses } from './open-source-licenses.js'
import { createPackedManifest, readWorkspaceCatalogs } from '#build/package-manifest.js'

const repoRoot = join(import.meta.dirname, '..', '..')

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Copy the minimal set of files that auditOpenSourceLicenses needs into a
 * tmpdir so the test never mutates the live working tree.
 */
function makeAuditFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'webpresso-oss-license-fixture-'))
  for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'package.json', 'pnpm-workspace.yaml']) {
    cpSync(join(repoRoot, file), join(root, file))
  }
  cpSync(join(repoRoot, 'catalog', 'agent', 'skills'), join(root, 'catalog', 'agent', 'skills'), {
    recursive: true,
  })
  return root
}

describe('open-source-licenses audit', () => {
  test('passes for the agent-kit repository', () => {
    const result = auditOpenSourceLicenses(repoRoot)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('keeps the repo and packed manifest on Elastic License 2.0', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      license?: string
    }
    const packedManifest = createPackedManifest(
      packageJson as Record<string, unknown>,
      readWorkspaceCatalogs(join(repoRoot, 'pnpm-workspace.yaml')),
    ) as { license?: string }
    const licenseText = readFileSync(join(repoRoot, 'LICENSE'), 'utf8')
    const notices = readFileSync(join(repoRoot, 'THIRD-PARTY-NOTICES.md'), 'utf8')

    expect(packageJson.license).toBe('Elastic-2.0')
    expect(packedManifest.license).toBe('Elastic-2.0')
    expect(licenseText).toContain('Elastic License 2.0')
    expect(notices).toContain('Elastic License 2.0')
  })

  test('is hermetic: a leftover prepack backup lock does not poison the audit', () => {
    // The packed-surface check used to run `npm pack`, whose prepack hook
    // (`preparePackedManifest`) throws "Packed-manifest backup already exists"
    // when `.package.json.prepack.backup` is present, then rewrites the live
    // package.json in place. So a backup left behind by an interrupted/parallel
    // pack made the audit report `ok: false`. The hermetic computation must
    // ignore that lock entirely.
    //
    // The fixture is a tmpdir copy of the minimal files the audit needs, so
    // the backup lock is never written into the live repo working tree.
    const root = makeAuditFixture()
    try {
      writeFileSync(join(root, '.package.json.prepack.backup'), '{}\n')
      const result = auditOpenSourceLicenses(root)
      expect(result.ok).toBe(true)
      expect(result.violations).toEqual([])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

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
