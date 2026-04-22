import type { NormalizedGraph } from '#graph/schema'

function escapeLabel(label: string): string {
  return label.replace(/\[/g, '(').replace(/\]/g, ')')
}

export function serializeGraphToMermaid(graph: NormalizedGraph): string {
  const direction = graph.layout?.direction ?? 'TD'
  const lines: string[] = [`graph ${direction}`]

  for (const node of graph.nodes) {
    lines.push(`  ${node.id}[${escapeLabel(node.label)}]`)
  }

  for (const edge of graph.edges) {
    if (edge.label) {
      lines.push(`  ${edge.source} --|${escapeLabel(edge.label)}| ${edge.target}`)
    } else {
      lines.push(`  ${edge.source} --> ${edge.target}`)
    }
  }

  return `${lines.join('\n')}\n`
}
