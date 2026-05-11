import { CycleDetector } from './cycle-detector.js';
export function topologicalSortTasksInput(tasks, taskMap) {
    const visited = new Set();
    const visiting = new Set();
    const result = [];
    for (const task of tasks) {
        visitTask(task, taskMap, visited, visiting, result);
    }
    return result;
}
function visitTask(task, taskMap, visited, visiting, result) {
    if (visited.has(task.id))
        return;
    if (visiting.has(task.id)) {
        throw new Error(`Circular dependency detected involving task "${task.id}"`);
    }
    visiting.add(task.id);
    for (const depId of task.dependencies) {
        const dep = taskMap.get(depId);
        if (dep)
            visitTask(dep, taskMap, visited, visiting, result);
    }
    visiting.delete(task.id);
    visited.add(task.id);
    result.push(task);
}
function initializeInDegrees(nodes) {
    const inDegree = new Map();
    for (const [id, node] of nodes) {
        inDegree.set(id, node.inDegree);
    }
    return inDegree;
}
function findZeroInDegreeNodes(inDegree) {
    const queue = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) {
            queue.push(id);
        }
    }
    return queue;
}
function processTopologicalNode(taskId, nodes, edges, inDegree, queue) {
    const node = nodes.get(taskId);
    if (!node)
        return null;
    const dependents = edges.get(taskId);
    if (dependents) {
        for (const dependentId of dependents) {
            const currentDegree = inDegree.get(dependentId) ?? 0;
            inDegree.set(dependentId, currentDegree - 1);
            if (inDegree.get(dependentId) === 0) {
                queue.push(dependentId);
            }
        }
    }
    return node.task;
}
export function getTopologicalOrderForGraph(nodes, edges) {
    const result = [];
    const inDegree = initializeInDegrees(nodes);
    const queue = findZeroInDegreeNodes(inDegree);
    while (queue.length > 0) {
        const taskId = queue.shift();
        if (!taskId)
            break;
        const task = processTopologicalNode(taskId, nodes, edges, inDegree, queue);
        if (task) {
            result.push(task);
        }
    }
    if (result.length !== nodes.size) {
        throw new Error('Circular dependency detected');
    }
    return result;
}
export function detectCyclesInGraph(nodes, edges) {
    const detector = new CycleDetector(edges);
    return detector.detect(nodes.keys());
}
function initializeDepthMaps(nodes) {
    const depth = new Map();
    const parent = new Map();
    for (const nodeId of nodes.keys()) {
        depth.set(nodeId, 0);
        parent.set(nodeId, null);
    }
    return { depth, parent };
}
function updateNeighborDepths(task, currentDepth, edges, depth, parent) {
    const taskEdges = edges.get(task.id);
    if (!taskEdges)
        return;
    for (const neighbor of taskEdges) {
        const newDepth = currentDepth + 1;
        if (newDepth > (depth.get(neighbor) ?? 0)) {
            depth.set(neighbor, newDepth);
            parent.set(neighbor, task.id);
        }
    }
}
function calculateDepths(nodes, edges, topOrder) {
    const { depth, parent } = initializeDepthMaps(nodes);
    for (const task of topOrder) {
        const currentDepth = depth.get(task.id) ?? 0;
        updateNeighborDepths(task, currentDepth, edges, depth, parent);
    }
    return { depth, parent };
}
function findDeepestNode(depth) {
    let maxDepth = -1;
    let endNode = null;
    for (const [nodeId, nodeDepth] of depth) {
        if (nodeDepth > maxDepth) {
            maxDepth = nodeDepth;
            endNode = nodeId;
        }
    }
    return endNode;
}
function reconstructPath(nodes, endNode, parent) {
    const path = [];
    let current = endNode;
    while (current !== null) {
        const node = nodes.get(current);
        if (node) {
            path.unshift(node.task);
        }
        current = parent.get(current) ?? null;
    }
    return path;
}
export function getCriticalPathForGraph(nodes, edges) {
    if (nodes.size === 0) {
        return [];
    }
    if (nodes.size === 1) {
        const task = nodes.values().next().value?.task;
        return task ? [task] : [];
    }
    const topOrder = getTopologicalOrderForGraph(nodes, edges);
    const { depth, parent } = calculateDepths(nodes, edges, topOrder);
    const endNode = findDeepestNode(depth);
    return reconstructPath(nodes, endNode, parent);
}
function processNodeDependents(node, edges, inDegree, nextQueue) {
    const dependents = edges.get(node.task.id);
    if (dependents) {
        for (const dependentId of dependents) {
            const currentDegree = inDegree.get(dependentId) ?? 0;
            inDegree.set(dependentId, currentDegree - 1);
            if (inDegree.get(dependentId) === 0) {
                nextQueue.push(dependentId);
            }
        }
    }
}
function processWave(nodes, edges, queue, inDegree) {
    const wave = [];
    const nextQueue = [];
    for (const taskId of queue) {
        const node = nodes.get(taskId);
        if (!node)
            continue;
        wave.push(node.task);
        processNodeDependents(node, edges, inDegree, nextQueue);
    }
    return { wave, nextQueue };
}
export function getWavesForGraph(nodes, edges) {
    const waves = [];
    const inDegree = initializeInDegrees(nodes);
    let queue = findZeroInDegreeNodes(inDegree);
    while (queue.length > 0) {
        const { wave, nextQueue } = processWave(nodes, edges, queue, inDegree);
        waves.push(wave);
        queue = nextQueue;
    }
    return waves;
}
function getIsolatedNodes(nodes, edges) {
    if (nodes.size <= 1)
        return [];
    const isolatedNodes = [];
    for (const [id, node] of nodes) {
        const hasIncoming = node.inDegree > 0;
        const hasOutgoing = (edges.get(id)?.size ?? 0) > 0;
        if (!hasIncoming && !hasOutgoing) {
            isolatedNodes.push(id);
        }
    }
    return isolatedNodes;
}
export function validateGraph(nodes, edges, reverseEdges) {
    const cycles = detectCyclesInGraph(nodes, edges);
    const errors = cycles?.length
        ? cycles.map((cycle) => `Circular dependency: ${cycle.join(' -> ')}`)
        : [];
    const warnings = getIsolatedNodes(nodes, edges).map((id) => `Task "${id}" is isolated (no dependencies or dependents)`);
    for (const [id, node] of nodes) {
        const actualDeps = reverseEdges.get(id) ?? new Set();
        for (const dep of node.task.dependencies) {
            if (!actualDeps.has(dep)) {
                warnings.push(`Task "${id}" declares dependency on "${dep}" but it's not wired in the graph`);
            }
        }
    }
    return {
        valid: !errors.length,
        errors,
        warnings,
    };
}
export function getGraphStatsForGraph(nodes, edges) {
    const waves = getWavesForGraph(nodes, edges);
    const isolatedNodes = getIsolatedNodes(nodes, edges);
    let edgeCount = 0;
    for (const edgeSet of edges.values()) {
        edgeCount += edgeSet.size;
    }
    let maxWidth = 0;
    for (const wave of waves) {
        maxWidth = Math.max(maxWidth, wave.length);
    }
    const cycles = detectCyclesInGraph(nodes, edges);
    return {
        nodeCount: nodes.size,
        edgeCount,
        maxDepth: getCriticalPathForGraph(nodes, edges).length,
        maxWidth,
        waveCount: waves.length,
        hasCycles: cycles !== null && cycles.length > 0,
        isolatedNodes,
    };
}
//# sourceMappingURL=task-graph-algorithms.js.map