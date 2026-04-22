import { describe, expect, it } from 'vitest'

import {
  clearBlueprintExecutionArtifacts,
  readBlueprintExecutionArtifacts,
  writeBlueprintExecutionArtifacts,
} from './artifacts'

const BASE_BLUEPRINT = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`

describe('execution artifact helpers', () => {
  it('writes and reads verification and artifact metadata', () => {
    const updated = writeBlueprintExecutionArtifacts(BASE_BLUEPRINT, {
      artifacts: ['logs/10-04-2026/11-30-10_test-1775813410966.log'],
      logPath: '.omx/state/blueprint-execution/omx-team/team-a.json',
      verifications: ['just test --file apps/cli-wp/src/commands/blueprint/execution.test.ts'],
    })

    expect(readBlueprintExecutionArtifacts(updated)).toEqual({
      artifacts: ['logs/10-04-2026/11-30-10_test-1775813410966.log'],
      logPath: '.omx/state/blueprint-execution/omx-team/team-a.json',
      verifications: ['just test --file apps/cli-wp/src/commands/blueprint/execution.test.ts'],
    })
  })

  it('clears artifact metadata cleanly', () => {
    const updated = writeBlueprintExecutionArtifacts(BASE_BLUEPRINT, {
      artifacts: ['logs/test.log'],
      logPath: '.omx/state/blueprint-execution/omx-team/team-a.json',
      verifications: ['just test --file packages/cli/blueprint/src/execution/artifacts.test.ts'],
    })

    expect(readBlueprintExecutionArtifacts(clearBlueprintExecutionArtifacts(updated))).toBeNull()
  })
})
