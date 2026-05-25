import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

const canonicalSubpaths = [
  'webpresso/tsconfig/base.json',
  'webpresso/vitest/node',
  'webpresso/stryker',
  'webpresso/oxlint',
  'webpresso/workers-test',
  'webpresso/docs-lint',
  'webpresso/launch',
  'webpresso/test-preset',
  'webpresso/e2e-preset',
] as const

async function readRepoFile(path: string): Promise<string> {
  return readFile(join(repositoryRoot, path), 'utf8')
}

describe('consolidation docs', () => {
  it('documents only canonical webpresso subpaths in the README', async () => {
    const readme = await readRepoFile('README.md')

    for (const canonicalSubpath of canonicalSubpaths) {
      expect(readme).toContain(canonicalSubpath)
    }

    expect(readme).not.toContain('@webpresso/agent-')
  })

  it('removes the migration notice document after the hard cutover', async () => {
    await expect(readRepoFile('MIGRATION.md')).rejects.toThrow()
  })

  it('preserves the published consolidation release note after changesets are consumed', async () => {
    const changelog = await readRepoFile('CHANGELOG.md')

    expect(changelog).toContain('## 0.18.0')
    expect(changelog).toContain('Consolidate the former `@webpresso/agent-*` helper packages')
    expect(changelog).toContain('webpresso/*` subpath exports')
  })
})
