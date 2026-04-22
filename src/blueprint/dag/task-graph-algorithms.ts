import type { GraphStats, ValidationResult } from './interfaces'
import type { Task, TaskNode } from './types'

import { CycleDetector } from './cycle-detector'

type NodesMap<T> = Map<string, TaskNode<T>>
type EdgesMap = Map<string, Set<string>>

export function topologicalSortTasksInput<T>(
  tasks: Task<T>[],
  taskMap: Map<string, Task<T>>,
): Task<T>[] {
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const result: Task<T>[] = []

  for (const task of tasks) {
    visitTask(task, taskMap, visited, visiting, result)
  }
  return result
}

function visitTask<T>(
  task: Task<T>,
  taskMap: Map<string, Task<T>>,
  visited: Set<string>,
  visiting: Set<string>,
  result: Task<T>[],
): void {
  if (visited.has(task.id)) return
  if (visiting.has(task.id)) {
    throw new Error(`Circular dependency detected involving task "${task.id}"`)
  }

  visiting.add(task.id)
  for (const depId of task.dependencies) {
    const dep = taskMap.get(depId)
    if (dep) visitTask(dep, taskMap, visited, visiting, result)
  }
  visiting.delete(task.id)
  visited.add(task.id)
  result.push(task)
}

function initializeInDegrees<T>(nodes: NodesMap<T>): Map<string, number> {
  const inDegree = new Map<string, number>()
  for (const [id, node] of nodes) {
    inDegree.set(id, node.inDegree)
  }
  return inDegree
}

function findZeroInDegreeNodes(inDegree: Map<string, number>): string[] {
  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id)
    }
  }
  return queue
}

function processTopologicalNode<T>(
  taskId: string,
  nodes: NodesMap<T>,
  edges: EdgesMap,
  inDegree: Map<string, number>,
  queue: string[],
): Task<T> | null {
  const node = nodes.get(taskId)
  if (!node) return null

  const dependents = edges.get(taskId)
  if (dependents) {
    for (const dependentId of dependents) {
      const currentDegree = inDegree.get(dependentId) ?? 0
      inDegree.set(dependentId, currentDegree - 1)

      if (inDegree.get(dependentId) === 0) {
        queue.push(dependentId)
      }
    }
  }

  return node.task
}

export function getTopologicalOrderForGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): Task<T>[] {
  const result: Task<T>[] = []
  const inDegree = initializeInDegrees(nodes)
  const queue = findZeroInDegreeNodes(inDegree)

  while (queue.length > 0) {
    const taskId = queue.shift()
    if (!taskId) break

    const task = processTopologicalNode(taskId, nodes, edges, inDegree, queue)
    if (task) {
      result.push(task)
    }
  }

  if (result.length !== nodes.size) {
    throw new Error('Circular dependency detected')
  }

  return result
}

export function detectCyclesInGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): string[][] | null {
  const detector = new CycleDetector(edges)
  return detector.detect(nodes.keys())
}

function initializeDepthMaps<T>(nodes: NodesMap<T>): {
  depth: Map<string, number>
  parent: Map<string, string | null>
} {
  const depth = new Map<string, number>()
  const parent = new Map<string, string | null>()

  for (const nodeId of nodes.keys()) {
    depth.set(nodeId, 0)
    parent.set(nodeId, null)
  }

  return { depth, parent }
}

function updateNeighborDepths<T>(
  task: Task<T>,
  currentDepth: number,
  edges: EdgesMap,
  depth: Map<string, number>,
  parent: Map<string, string | null>,
): void {
  const taskEdges = edges.get(task.id)
  if (!taskEdges) return

  for (const neighbor of taskEdges) {
    const newDepth = currentDepth + 1
    if (newDepth > (depth.get(neighbor) ?? 0)) {
      depth.set(neighbor, newDepth)
      parent.set(neighbor, task.id)
    }
  }
}

function calculateDepths<T>(
  nodes: NodesMap<T>,
  edges: EdgesMap,
  topOrder: Task<T>[],
): {
  depth: Map<string, number>
  parent: Map<string, string | null>
} {
  const { depth, parent } = initializeDepthMaps(nodes)

  for (const task of topOrder) {
    const currentDepth = depth.get(task.id) ?? 0
    updateNeighborDepths(task, currentDepth, edges, depth, parent)
  }

  return { depth, parent }
}

function findDeepestNode(depth: Map<string, number>): string | null {
  let maxDepth = -1
  let endNode: string | null = null

  for (const [nodeId, nodeDepth] of depth) {
    if (nodeDepth > maxDepth) {
      maxDepth = nodeDepth
      endNode = nodeId
    }
  }

  return endNode
}

function reconstructPath<T>(
  nodes: NodesMap<T>,
  endNode: string | null,
  parent: Map<string, string | null>,
): Task<T>[] {
  const path: Task<T>[] = []
  let current = endNode

  while (current !== null) {
    const node = nodes.get(current)
    if (node) {
      path.unshift(node.task)
    }
    current = parent.get(current) ?? null
  }

  return path
}

export function getCriticalPathForGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): Task<T>[] {
  if (nodes.size === 0) {
    return []
  }

  if (nodes.size === 1) {
    const task = nodes.values().next().value?.task
    return task ? [task] : []
  }

  const topOrder = getTopologicalOrderForGraph(nodes, edges)
  const { depth, parent } = calculateDepths(nodes, edges, topOrder)
  const endNode = findDeepestNode(depth)

  return reconstructPath(nodes, endNode, parent)
}

function processNodeDependents<T>(
  node: TaskNode<T>,
  edges: EdgesMap,
  inDegree: Map<string, number>,
  nextQueue: string[],
): void {
  const dependents = edges.get(node.task.id)
  if (dependents) {
    for (const dependentId of dependents) {
      const currentDegree = inDegree.get(dependentId) ?? 0
      inDegree.set(dependentId, currentDegree - 1)

      if (inDegree.get(dependentId) === 0) {
        nextQueue.push(dependentId)
      }
    }
  }
}

function processWave<T>(
  nodes: NodesMap<T>,
  edges: EdgesMap,
  queue: string[],
  inDegree: Map<string, number>,
): { wave: Task<T>[]; nextQueue: string[] } {
  const wave: Task<T>[] = []
  const nextQueue: string[] = []

  for (const taskId of queue) {
    const node = nodes.get(taskId)
    if (!node) continue

    wave.push(node.task)
    processNodeDependents(node, edges, inDegree, nextQueue)
  }

  return { wave, nextQueue }
}

export function getWavesForGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): Task<T>[][] {
  const waves: Task<T>[][] = []
  const inDegree = initializeInDegrees(nodes)
  let queue = findZeroInDegreeNodes(inDegree)

  while (queue.length > 0) {
    const { wave, nextQueue } = processWave(nodes, edges, queue, inDegree)
    waves.push(wave)
    queue = nextQueue
  }

  return waves
}

function getIsolatedNodes<T>(nodes: NodesMap<T>, edges: EdgesMap): string[] {
  if (nodes.size <= 1) return []

  const isolatedNodes: string[] = []
  for (const [id, node] of nodes) {
    const hasIncoming = node.inDegree > 0
    const hasOutgoing = (edges.get(id)?.size ?? 0) > 0

    if (!hasIncoming && !hasOutgoing) {
      isolatedNodes.push(id)
    }
  }
  return isolatedNodes
}

export function validateGraph<T>(
  nodes: NodesMap<T>,
  edges: EdgesMap,
  reverseEdges: EdgesMap,
): ValidationResult {
  const cycles = detectCyclesInGraph(nodes, edges)
  const errors = cycles?.length
    ? cycles.map((cycle) => `Circular dependency: ${cycle.join(' -> ')}`)
    : []

  const warnings = getIsolatedNodes(nodes, edges).map(
    (id) => `Task "${id}" is isolated (no dependencies or dependents)`,
  )

  for (const [id, node] of nodes) {
    const actualDeps = reverseEdges.get(id) ?? new Set()
    for (const dep of node.task.dependencies) {
      if (!actualDeps.has(dep)) {
        warnings.push(
          `Task "${id}" declares dependency on "${dep}" but it's not wired in the graph`,
        )
      }
    }
  }

  return {
    valid: !errors.length,
    errors,
    warnings,
  }
}

export function getGraphStatsForGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): GraphStats {
  const waves = getWavesForGraph(nodes, edges)
  const isolatedNodes = getIsolatedNodes(nodes, edges)

  let edgeCount = 0
  for (const edgeSet of edges.values()) {
    edgeCount += edgeSet.size
  }

  let maxWidth = 0
  for (const wave of waves) {
    maxWidth = Math.max(maxWidth, wave.length)
  }

  const cycles = detectCyclesInGraph(nodes, edges)

  return {
    nodeCount: nodes.size,
    edgeCount,
    maxDepth: getCriticalPathForGraph(nodes, edges).length,
    maxWidth,
    waveCount: waves.length,
    hasCycles: cycles !== null && cycles.length > 0,
    isolatedNodes,
  }
}
