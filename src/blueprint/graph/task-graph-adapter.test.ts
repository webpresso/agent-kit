import { describe, expect, it } from 'vitest'

import { TaskGraph } from '#dag/task-graph'
import { taskGraphToNormalizedGraph } from '#graph/task-graph-adapter'

describe('taskGraphToNormalizedGraph', () => {
  it('converts task graph tasks and dependencies', () => {
    const graph = new TaskGraph<{ title: string }>()
    graph.addTask({ id: '1.1', data: { title: 'First' }, dependencies: [] })
    graph.addTask({ id: '1.2', data: { title: 'Second' }, dependencies: ['1.1'] })
    graph.addTask({ id: '1.3', data: { title: 'Third' }, dependencies: ['1.2'] })

    graph.addDependency('1.1', '1.2')
    graph.addDependency('1.2', '1.3')

    const normalized = taskGraphToNormalizedGraph(graph)

    expect(normalized.nodes).toHaveLength(3)
    expect(normalized.edges).toEqual([
      { source: '1.1', target: '1.2', type: 'depends_on' },
      { source: '1.2', target: '1.3', type: 'depends_on' },
    ])
    expect(normalized.nodes.find((node) => node.id === '1.1')?.metadata?.wave_number).toBe(0)
    expect(normalized.nodes.find((node) => node.id === '1.2')?.metadata?.wave_number).toBe(1)
  })
})
