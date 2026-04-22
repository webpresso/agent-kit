import { describe, expect, it } from 'vitest'

import { parseMermaidToGraph } from '#graph/mermaid-parser'
import { serializeGraphToMermaid } from '#graph/mermaid-serializer'

describe('serializeGraphToMermaid', () => {
  it('serializes normalized graph to mermaid', () => {
    const mermaid = serializeGraphToMermaid({
      nodes: [
        { id: 'A', type: 'task', label: 'Task A' },
        { id: 'B', type: 'task', label: 'Task B' },
      ],
      edges: [{ source: 'A', target: 'B', type: 'depends_on' }],
      layout: { direction: 'LR' },
    })

    expect(mermaid).toContain('graph LR')
    expect(mermaid).toContain('A[Task A]')
    expect(mermaid).toContain('A --> B')
  })

  it('supports round-trip parse/serialize/parse', () => {
    const input = 'graph TD\nA[First]-->B[Second]\nB-->C'
    const parsed = parseMermaidToGraph(input)
    const serialized = serializeGraphToMermaid(parsed)
    const reparsed = parseMermaidToGraph(serialized)

    expect(reparsed).toEqual(parsed)
  })
})
