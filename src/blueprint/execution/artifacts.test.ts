import { describe, expect, it } from 'vitest'

import {
  clearBlueprintExecutionArtifacts,
  readBlueprintExecutionArtifacts,
  writeBlueprintExecutionArtifacts,
} from './artifacts.js'

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

  it('returns null when frontmatter has empty string artifacts', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_artifacts:
  - ''
  - ' '
execution_verifications: []
execution_log_path: ''
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionArtifacts(blueprint)).toBeNull()
  })

  it('reads partial artifact data when only some fields are present', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_artifacts:
  - build.log
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionArtifacts(blueprint)).toEqual({
      artifacts: ['build.log'],
      logPath: undefined,
      verifications: [],
    })
  })

  it('handles non-string values in artifact arrays gracefully', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_artifacts:
  - valid.log
  - 42
  - ''
  - null
execution_verifications: []
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionArtifacts(blueprint)).toEqual({
      artifacts: ['valid.log'],
      logPath: undefined,
      verifications: [],
    })
  })

  it('returns null when only logPath is an empty string', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_artifacts: []
execution_verifications: []
execution_log_path: ' '
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionArtifacts(blueprint)).toBeNull()
  })

  it('returns result when only logPath is present', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_artifacts: []
execution_verifications: []
execution_log_path: path/to/log.json
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionArtifacts(blueprint)).toEqual({
      artifacts: [],
      logPath: 'path/to/log.json',
      verifications: [],
    })
  })
})
