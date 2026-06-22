import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

describe('CI workflow public runner contract', () => {
  it('routes every CI job through the GitHub-hosted ubuntu-latest label', () => {
    const workflow = readFileSync(
      join(repositoryRoot, '.github', 'workflows', 'ci.agent-kit.yml'),
      'utf8',
    )

    expect(workflow).toContain('runs-on: ubuntu-latest')
    expect(workflow).not.toContain('runs-on: ubicloud-standard-2')
  })
})
