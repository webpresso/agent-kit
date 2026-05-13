import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DEPRECATION_NOTICE =
  'Deprecated: migrate to the consolidated webpresso package subpath exports. See https://github.com/webpresso/agent-kit/blob/main/MIGRATION.md'

const AGENT_PACKAGE_DIRS = [
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

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('agent sub-package deprecation metadata', () => {
  it('uses one migration notice across every agent sub-package manifest', () => {
    for (const packageDir of AGENT_PACKAGE_DIRS) {
      const manifest = readJson(resolve(repoRoot, 'packages', packageDir, 'package.json'))

      expect(manifest['deprecated'], packageDir).toBe(DEPRECATION_NOTICE)
    }
  })

  it('preserves every deprecated agent sub-package after changesets are consumed', () => {
    expect(existsSync(resolve(repoRoot, '.changeset', 'deprecate-agent-subpackages.md'))).toBe(
      false,
    )

    for (const packageDir of AGENT_PACKAGE_DIRS) {
      const manifest = readJson(resolve(repoRoot, 'packages', packageDir, 'package.json'))

      expect(manifest['deprecated'], String(manifest['name'])).toBe(DEPRECATION_NOTICE)
    }

    const changelog = readFileSync(resolve(repoRoot, 'CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('## 0.18.0')
    expect(changelog).toContain('Consolidate the former `@webpresso/agent-*` helper packages')
  })
})
