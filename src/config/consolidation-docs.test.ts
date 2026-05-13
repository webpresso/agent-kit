import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

const migrationRows = [
  ['@webpresso/agent-tsconfig/base.json', 'webpresso/tsconfig/base.json'],
  ['@webpresso/agent-vitest/node', 'webpresso/vitest/node'],
  ['@webpresso/agent-stryker', 'webpresso/stryker'],
  ['@webpresso/agent-oxlint', 'webpresso/oxlint'],
  ['@webpresso/agent-workers-test', 'webpresso/workers-test'],
  ['@webpresso/agent-docs-lint', 'webpresso/docs-lint'],
  ['@webpresso/agent-launch', 'webpresso/launch'],
  ['@webpresso/agent-test-preset', 'webpresso/test-preset'],
  ['@webpresso/agent-e2e-preset', 'webpresso/e2e-preset'],
] as const

async function readRepoFile(path: string): Promise<string> {
  return readFile(join(repositoryRoot, path), 'utf8')
}

describe('consolidation migration docs', () => {
  it('documents every old package to webpresso subpath migration', async () => {
    const migration = await readRepoFile('MIGRATION.md')
    const readme = await readRepoFile('README.md')

    for (const [oldSpecifier, newSpecifier] of migrationRows) {
      expect(migration).toContain(oldSpecifier)
      expect(migration).toContain(newSpecifier)
      expect(readme).toContain(oldSpecifier)
      expect(readme).toContain(newSpecifier)
    }
  })

  it('documents the oxlint TypeScript config migration and public staging caveat', async () => {
    const migration = await readRepoFile('MIGRATION.md')

    expect(migration).toContain('.oxlintrc.json')
    expect(migration).toContain('oxlint.config.ts')
    expect(migration).toContain('TypeScript')
    expect(migration).toContain('scripts/publish-webpresso.ts')
    expect(migration).toContain('package.json#name')
    expect(migration).toContain('@webpresso/agent-kit')
  })

  it('ships a consolidation changeset without publishing in this task', async () => {
    const changeset = await readRepoFile('.changeset/consolidate-agent-subpackages.md')

    expect(changeset).toContain('"@webpresso/agent-kit": minor')
    expect(changeset).toContain('webpresso')
    expect(changeset).toContain('No publish happens in this changeset')
  })
})
