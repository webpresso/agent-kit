import { readFileSync } from 'node:fs'
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

  it('includes every deprecated agent sub-package in the release changeset', () => {
    const changeset = readFileSync(
      resolve(repoRoot, '.changeset', 'deprecate-agent-subpackages.md'),
      'utf8',
    )

    for (const packageDir of AGENT_PACKAGE_DIRS) {
      const manifest = readJson(resolve(repoRoot, 'packages', packageDir, 'package.json'))

      expect(changeset).toContain(`"${manifest['name']}": patch`)
    }

    expect(changeset).toContain(DEPRECATION_NOTICE)
  })
})
