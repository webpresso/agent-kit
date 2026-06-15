import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

describe('harness gate workflow runner contract', () => {
  it('uses the Ubicloud managed runner label for the planned-only harness gate', () => {
    const workflow = readFileSync(
      join(repositoryRoot, '.github', 'workflows', 'harness-gate.yml'),
      'utf8',
    )

    expect(workflow).toContain('name: Harness Selection Gate (planned-only)')
    expect(workflow).toContain('name: Planned-only harness selection verdict')
    expect(workflow).toContain('runs-on: ubicloud-standard-2')
    expect(workflow).not.toContain('runs-on: ubuntu-latest')
  })
})
