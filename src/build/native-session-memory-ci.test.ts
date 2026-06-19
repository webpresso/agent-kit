import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

describe('native session-memory CI warmup', () => {
  it('warms the native addon before the public CI parallel test suite', () => {
    const workflow = readFileSync(join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8')

    expect(workflow).toContain('Warm native session-memory addon')
    expect(workflow.indexOf('Warm native session-memory addon')).toBeLessThan(
      workflow.indexOf('- run: pnpm run test'),
    )
    expect(workflow).toContain('loadNativeSessionMemoryEngine')
  })

  it('warms the native addon before the agent-kit self parallel test suite', () => {
    const workflow = readFileSync(
      join(repositoryRoot, '.github', 'workflows', 'ci.agent-kit.yml'),
      'utf8',
    )

    expect(workflow).toContain('Warm native session-memory addon')
    expect(workflow.indexOf('Warm native session-memory addon')).toBeLessThan(
      workflow.indexOf('- run: pnpm run test'),
    )
    expect(workflow).toContain('loadNativeSessionMemoryEngine')
  })
})
