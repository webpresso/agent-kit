import { describe, expect, it } from 'vitest'

import { createMockBlueprint, createMockTask } from './test-utils/blueprint-mocks.js'

describe('agent-kit blueprint test-utils', () => {
  it('exports the moved blueprint mock helpers', () => {
    const task = createMockTask({ id: '1.2', title: 'Shared fixtures' })
    const blueprint = createMockBlueprint({
      name: 'export-contract',
      tasks: [task],
    })

    expect(task.id).toBe('1.2')
    expect(blueprint.name).toBe('export-contract')
    expect(blueprint.tasks).toHaveLength(1)
    expect(blueprint.tasks[0]?.title).toBe('Shared fixtures')
  })
})
