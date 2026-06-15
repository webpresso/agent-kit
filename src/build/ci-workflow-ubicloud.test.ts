import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

describe('CI workflow Ubicloud runner contract', () => {
  it('routes every CI job through the Ubicloud managed runner label', () => {
    const workflow = readFileSync(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8')

    expect(workflow).toContain('runs-on: ubicloud-standard-2')
    expect(workflow).not.toContain('runs-on: ubuntu-latest')
  })
})
