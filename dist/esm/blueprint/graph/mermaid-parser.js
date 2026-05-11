import { normalizedGraphSchema, } from '#graph/schema';
const DIRECTION_LINE = /^graph\s+(TD|LR|BT|RL)$/;
const EDGE_WITH_LABEL = /^([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?\s*--\|([^|]+)\|\s*([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?$/;
const EDGE_SIMPLE = /^([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?\s*-->\s*([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?$/;
const NODE_ONLY = /^([A-Za-z0-9_-]+)\[([^\]]+)\]$/;
function upsertNode(nodes, id, label) {
    const existing = nodes.get(id);
    if (existing) {
        if (label && existing.label === id) {
            nodes.set(id, { ...existing, label });
        }
        return;
    }
    nodes.set(id, {
        id,
        type: 'task',
        label: label ?? id,
    });
}
function parseEdge(line, nodes, edges) {
    const labeled = line.match(EDGE_WITH_LABEL);
    if (labeled) {
        const source = labeled[1] ?? '';
        const sourceLabel = labeled[2];
        const edgeLabel = (labeled[3] ?? '').trim();
        const target = labeled[4] ?? '';
        const targetLabel = labeled[5];
        upsertNode(nodes, source, sourceLabel);
        upsertNode(nodes, target, targetLabel);
        edges.push({
            source,
            target,
            type: 'depends_on',
            label: edgeLabel,
        });
        return true;
    }
    const simple = line.match(EDGE_SIMPLE);
    if (!simple) {
        return false;
    }
    const source = simple[1] ?? '';
    const sourceLabel = simple[2];
    const target = simple[3] ?? '';
    const targetLabel = simple[4];
    upsertNode(nodes, source, sourceLabel);
    upsertNode(nodes, target, targetLabel);
    edges.push({
        source,
        target,
        type: 'depends_on',
    });
    return true;
}
export function parseMermaidToGraph(mermaid) {
    const lines = mermaid
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('%%'))
        .map((line) => (line.endsWith(';') ? line.slice(0, -1).trim() : line));
    if (!lines.length) {
        throw new Error('Mermaid input is empty');
    }
    const directionMatch = lines[0]?.match(DIRECTION_LINE);
    if (!directionMatch?.[1]) {
        throw new Error('Mermaid must start with "graph <direction>"');
    }
    const direction = directionMatch[1];
    const nodes = new Map();
    const edges = [];
    for (const line of lines.slice(1)) {
        if (line === '' || line.startsWith('subgraph') || line === 'end') {
            continue;
        }
        if (parseEdge(line, nodes, edges)) {
            continue;
        }
        const nodeOnly = line.match(NODE_ONLY);
        if (nodeOnly) {
            const id = nodeOnly[1] ?? '';
            const label = nodeOnly[2] ?? id;
            upsertNode(nodes, id, label);
            continue;
        }
        throw new Error(`Unsupported Mermaid line: ${line}`);
    }
    return normalizedGraphSchema.parse({
        nodes: [...nodes.values()],
        edges,
        layout: { direction },
    });
}
//# sourceMappingURL=mermaid-parser.js.map