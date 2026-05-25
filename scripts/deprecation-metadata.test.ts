import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const REMOVED_HELPER_PACKAGES = [
  'agent-tsconfig',
  'agent-vitest',
  'agent-stryker',
  'agent-oxlint',
  'agent-workers-test',
  'agent-docs-lint',
  'agent-launch',
  'agent-test-preset',
  'agent-e2e-preset',
] as const

describe('helper package hardcut metadata', () => {
  it('removes the deprecated helper package manifests after the hardcut', () => {
    for (const packageDir of REMOVED_HELPER_PACKAGES) {
      expect(
        existsSync(resolve(repoRoot, 'packages', packageDir, 'package.json')),
        packageDir,
      ).toBe(false)
    }
  })

  it('preserves the release-history note after the helper package removal changeset is consumed', () => {
    expect(existsSync(resolve(repoRoot, '.changeset', 'deprecate-agent-subpackages.md'))).toBe(
      false,
    )

    const changelog = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('## 0.18.0')
    expect(changelog).toContain('Consolidate the former `@webpresso/agent-*` helper packages')
  })
})
