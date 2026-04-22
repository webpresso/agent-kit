import { describe, expect, it } from 'vitest'

import { normalizedGraphSchema } from '#graph/schema'

describe('normalizedGraphSchema', () => {
  it('validates a well-formed graph', () => {
    const result = normalizedGraphSchema.parse({
      nodes: [
        { id: 'A', type: 'task', label: 'Task A' },
        { id: 'B', type: 'task', label: 'Task B' },
      ],
      edges: [{ source: 'A', target: 'B', type: 'depends_on' }],
      layout: { direction: 'TD' },
    })

    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
  })

  it('rejects edge references to missing nodes', () => {
    const result = normalizedGraphSchema.safeParse({
      nodes: [{ id: 'A', type: 'task', label: 'Task A' }],
      edges: [{ source: 'A', target: 'B', type: 'depends_on' }],
    })

    expect(result.success).toBe(false)
  })

  it('rejects cyclic graphs', () => {
    const result = normalizedGraphSchema.safeParse({
      nodes: [
        { id: 'A', type: 'task', label: 'Task A' },
        { id: 'B', type: 'task', label: 'Task B' },
      ],
      edges: [
        { source: 'A', target: 'B', type: 'depends_on' },
        { source: 'B', target: 'A', type: 'depends_on' },
      ],
    })

    expect(result.success).toBe(false)
  })
})
