import { describe, expect, it } from 'vitest'

import { parseMermaidToGraph } from '#graph/mermaid-parser'

describe('parseMermaidToGraph', () => {
  it('parses basic flowchart syntax', () => {
    const graph = parseMermaidToGraph('graph TD\nA-->B\nB-->C')

    expect(graph.layout?.direction).toBe('TD')
    expect(graph.nodes.map((node) => node.id)).toEqual(['A', 'B', 'C'])
    expect(graph.edges).toEqual([
      { source: 'A', target: 'B', type: 'depends_on' },
      { source: 'B', target: 'C', type: 'depends_on' },
    ])
  })

  it('parses node and edge labels', () => {
    const graph = parseMermaidToGraph('graph LR\nA[Start]--|ships|B[Done]')

    expect(graph.layout?.direction).toBe('LR')
    expect(graph.nodes.find((node) => node.id === 'A')?.label).toBe('Start')
    expect(graph.edges[0]?.label).toBe('ships')
  })

  it('throws on malformed input', () => {
    expect(() => parseMermaidToGraph('A-->B')).toThrow(
      'Mermaid must start with "graph <direction>"',
    )
  })
})
