import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

const currentGuidanceFiles = [
  'README.md',
  'docs/getting-started.md',
  'docs/is-agent-kit-for-me.md',
  'docs/ci-act.md',
] as const

async function readRepoFile(path: string): Promise<string> {
  return readFile(join(repositoryRoot, path), 'utf8')
}

describe('consolidation docs', () => {
  it('keeps the README focused on the canonical package identity and the appendix link', async () => {
    const readme = await readRepoFile('README.md')

    expect(readme).toContain('@webpresso/agent-kit')
    expect(readme).toContain('docs/markdown-fact-check.md')
  })

  it('keeps removed branded preset paths out of current guidance docs', async () => {
    for (const file of currentGuidanceFiles) {
      const content = await readRepoFile(file)

      expect(content, `${file} should not teach removed vitest/webpresso presets`).not.toContain(
        'vitest/webpresso',
      )
      expect(content, `${file} should not teach removed tsconfig/webpresso presets`).not.toContain(
        'tsconfig/webpresso',
      )
      expect(content, `${file} should not teach removed stryker/webpresso presets`).not.toContain(
        'stryker/webpresso',
      )
    }
  })

  it('removes the migration notice document after the hard cutover', async () => {
    await expect(readRepoFile('MIGRATION.md')).rejects.toThrow()
  })

  it('preserves the published consolidation release note after changesets are consumed', async () => {
    const changelog = await readRepoFile('CHANGELOG.md')

    expect(changelog).toContain('## 0.18.0')
    expect(changelog).toContain('Consolidate the former `@webpresso/agent-*` helper packages')
    expect(changelog).toContain('subpath exports')
  })
})
