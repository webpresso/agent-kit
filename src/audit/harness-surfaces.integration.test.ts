import { describe, expect, it } from 'vitest'

import { runAuditDispatch } from '../cli/commands/audit-core.js'
import { auditHarnessSurfaces } from './harness-surfaces.js'

describe('wp audit harness-surfaces dispatch', () => {
  it('routes through the repo audit registry contract', async () => {
    const outcome = await runAuditDispatch('harness-surfaces', [], {}, {
      root: process.cwd(),
      runStryker: async () => 0,
      runRepoAudit: (name, root) => {
        expect(name).toBe('harness-surfaces')
        return auditHarnessSurfaces(root)
      },
      runBundleBudget: async () => 0,
      runCommitMessageAudit: () => ({ ok: true, title: 'commit', checked: 1, violations: [] }),
      buildBundleBudgetArgs: () => [],
      knownRepoKinds: ['harness-surfaces'],
    })

    expect(outcome.kind).toBe('repo-result')
    if (outcome.kind === 'repo-result') {
      expect(outcome.name).toBe('harness-surfaces')
      expect(outcome.result.ok).toBe(true)
      expect(outcome.result.checked).toBeGreaterThan(0)
    }
  })
})
