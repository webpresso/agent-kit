import { z } from 'zod';
export const graphNodeTypeSchema = z.enum([
    'task',
    'milestone',
    'decision',
    'external',
    'tech_debt',
    'blueprint',
]);
export const graphEdgeTypeSchema = z.enum(['depends_on', 'blocks', 'relates_to']);
export const graphNodeSchema = z.object({
    id: z.string().min(1),
    type: graphNodeTypeSchema,
    label: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export const graphEdgeSchema = z.object({
    source: z.string().min(1),
    target: z.string().min(1),
    type: graphEdgeTypeSchema,
    label: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export const graphLayoutSchema = z.object({
    direction: z.enum(['TD', 'LR', 'BT', 'RL']).default('TD'),
    rankdir: z.string().optional(),
});
function hasCycle(edges) {
    const adjacency = new Map();
    const visiting = new Set();
    const visited = new Set();
    for (const edge of edges) {
        const targets = adjacency.get(edge.source) ?? [];
        targets.push(edge.target);
        adjacency.set(edge.source, targets);
    }
    function visit(node) {
        if (visiting.has(node)) {
            return true;
        }
        if (visited.has(node)) {
            return false;
        }
        visiting.add(node);
        const targets = adjacency.get(node) ?? [];
        for (const target of targets) {
            if (visit(target)) {
                return true;
            }
        }
        visiting.delete(node);
        visited.add(node);
        return false;
    }
    for (const node of adjacency.keys()) {
        if (visit(node)) {
            return true;
        }
    }
    return false;
}
export const normalizedGraphSchema = z
    .object({
    nodes: z.array(graphNodeSchema),
    edges: z.array(graphEdgeSchema),
    layout: graphLayoutSchema.optional(),
})
    .superRefine((graph, context) => {
    const nodeIds = new Set();
    for (const [index, node] of graph.nodes.entries()) {
        if (nodeIds.has(node.id)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Duplicate node id: ${node.id}`,
                path: ['nodes', index, 'id'],
            });
        }
        nodeIds.add(node.id);
    }
    for (const [index, edge] of graph.edges.entries()) {
        if (!nodeIds.has(edge.source)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Edge source not found: ${edge.source}`,
                path: ['edges', index, 'source'],
            });
        }
        if (!nodeIds.has(edge.target)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Edge target not found: ${edge.target}`,
                path: ['edges', index, 'target'],
            });
        }
    }
    if (hasCycle(graph.edges)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Graph contains a cycle',
            path: ['edges'],
        });
    }
});
//# sourceMappingURL=schema.js.map