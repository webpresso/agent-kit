import { describe, expect, it } from 'vitest'

import {
  clearBlueprintExecutionMetadata,
  readBlueprintExecutionMetadata,
  writeBlueprintExecutionMetadata,
} from './metadata.js'

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

describe('execution metadata helpers', () => {
  it('writes and reads durable execution metadata', () => {
    const updated = writeBlueprintExecutionMetadata(BASE_BLUEPRINT, {
      backend: 'omx-team',
      executionId: 'test-team',
      status: 'running',
      updatedAt: '2026-04-10T10:00:00Z',
    })

    expect(readBlueprintExecutionMetadata(updated)).toEqual({
      backend: 'omx-team',
      executionId: 'test-team',
      status: 'running',
      updatedAt: '2026-04-10T10:00:00Z',
    })
  })

  it('returns null when metadata is incomplete', () => {
    const updated = BASE_BLUEPRINT.replace(
      'last_updated: 2026-04-10',
      'execution_backend: omx-team',
    )
    expect(readBlueprintExecutionMetadata(updated)).toBeNull()
  })

  it('reads yaml timestamps that gray-matter parsed as dates', () => {
    const updated = writeBlueprintExecutionMetadata(BASE_BLUEPRINT, {
      backend: 'omx-team',
      executionId: 'test-team',
      status: 'completed',
      updatedAt: '2026-04-10T10:00:00.000Z',
    })

    expect(readBlueprintExecutionMetadata(updated)).toEqual({
      backend: 'omx-team',
      executionId: 'test-team',
      status: 'completed',
      updatedAt: '2026-04-10T10:00:00.000Z',
    })
  })

  it('clears execution metadata cleanly', () => {
    const updated = writeBlueprintExecutionMetadata(BASE_BLUEPRINT, {
      backend: 'omx-team',
      executionId: 'test-team',
      status: 'running',
      updatedAt: '2026-04-10T10:00:00Z',
    })

    expect(readBlueprintExecutionMetadata(clearBlueprintExecutionMetadata(updated))).toBeNull()
  })

  it('returns null when updatedAt is an empty string', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_status: running
execution_id: test-team
execution_updated_at: '  '
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionMetadata(blueprint)).toBeNull()
  })

  it('returns null when executionId is missing', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_status: running
execution_updated_at: '2026-04-10T10:00:00Z'
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionMetadata(blueprint)).toBeNull()
  })

  it('returns null when backend parse fails', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: invalid
execution_status: running
execution_id: test-team
execution_updated_at: '2026-04-10T10:00:00Z'
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionMetadata(blueprint)).toBeNull()
  })

  it('returns null when status parse fails', () => {
    const blueprint = `---
type: blueprint
status: in-progress
complexity: M
created: 2026-04-10
last_updated: 2026-04-10
execution_backend: omx-team
execution_status: broken
execution_id: test-team
execution_updated_at: '2026-04-10T10:00:00Z'
---

# test

#### Task 1.1: Example
**Status:** todo

**Depends:** None

- [ ] a
`
    expect(readBlueprintExecutionMetadata(blueprint)).toBeNull()
  })
})
