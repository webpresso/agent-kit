import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

describe('CI workflow Version Packages gating', () => {
  it('skips blueprint-gate for changeset release PR branches', () => {
    const workflow = readFileSync(join(repositoryRoot, '.github', 'workflows', 'ci.agent-kit.yml'), 'utf8')

    expect(workflow).toContain('blueprint-gate:')
    expect(workflow).toContain(
      "github.event_name == 'pull_request' && !startsWith(github.head_ref, 'changeset-release/')",
    )
  })
})
