import { CycleDetector } from './cycle-detector.js';
import { detectCyclesInGraph, getCriticalPathForGraph, getGraphStatsForGraph, getTopologicalOrderForGraph, getWavesForGraph, topologicalSortTasksInput, validateGraph, } from './task-graph-algorithms.js';
/**
 * DAG (Directed Acyclic Graph) analysis for parallel task execution.
 *
 * Provides:
 * - Topological sorting (Kahn's Algorithm)
 * - Cycle detection (DFS)
 * - Critical path analysis (longest dependency chain)
 * - Wave grouping (parallel execution batches)
 * - Parallelization metrics
 * - Validation and statistics
 *
 * Zero dependencies. Works with Bun, Node.js, Deno.
 *
 * @template T - The type of additional data attached to tasks
 */
export class TaskGraph {
    nodes;
    edges; // from -> to[]
    reverseEdges; // to -> from[] (for validation)
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
        this.reverseEdges = new Map();
    }
    /**
     * Add a task to the graph.
     * Must be called before adding dependencies.
     */
    addTask(task) {
        if (this.nodes.has(task.id)) {
            throw new Error(`Task "${task.id}" already exists in the graph`);
        }
        this.nodes.set(task.id, {
            task,
            inDegree: 0,
        });
    }
    /**
     * Add a task and automatically wire up its dependencies.
     * This is the preferred method for LLM agents - single call instead of addTask + addDependency.
     *
     * @param task - Task with dependencies array populated
     * @throws {Error} If task already exists or dependencies reference non-existent tasks
     */
    addTaskWithDependencies(task) {
        this.addTask(task);
        for (const depId of task.dependencies) {
            if (!this.nodes.has(depId)) {
                // Remove the task we just added to maintain consistency
                this.nodes.delete(task.id);
                throw new Error(`Cannot add task "${task.id}": dependency "${depId}" does not exist. ` +
                    `Add dependencies first, or use addTask() + addDependency() for more control.`);
            }
            this.addDependency(depId, task.id);
        }
    }
    /**
     * Bulk add tasks with automatic dependency wiring.
     * Tasks are sorted by dependency depth before adding.
     *
     * @param tasks - Array of tasks to add
     * @throws {Error} If circular dependencies detected or tasks reference non-existent dependencies
     */
    addTasksWithDependencies(tasks) {
        // Build a map for quick lookup
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        // Topological sort the input tasks
        const sorted = topologicalSortTasksInput(tasks, taskMap);
        // Add in sorted order
        for (const task of sorted) {
            this.addTaskWithDependencies(task);
        }
    }
    /**
     * Add a dependency between two tasks.
     * @param from - The task that must complete first
     * @param to - The task that depends on `from`
     * @throws {Error} If tasks don't exist, self-loop detected
     */
    addDependency(from, to) {
        this.validateDependencyNodes(from, to);
        if (this.edgeExists(from, to))
            return;
        this.addForwardEdge(from, to);
        this.addReverseEdge(from, to);
        this.incrementInDegree(to);
    }
    validateDependencyNodes(from, to) {
        if (!this.nodes.has(from)) {
            throw new Error(`Cannot add dependency: source task "${from}" does not exist`);
        }
        if (!this.nodes.has(to)) {
            throw new Error(`Cannot add dependency: target task "${to}" does not exist`);
        }
        if (from === to) {
            throw new Error(`Cannot add self-loop: task "${from}" cannot depend on itself`);
        }
    }
    edgeExists(from, to) {
        return this.edges.get(from)?.has(to) ?? false;
    }
    addForwardEdge(from, to) {
        if (!this.edges.has(from)) {
            this.edges.set(from, new Set());
        }
        this.edges.get(from)?.add(to);
    }
    addReverseEdge(from, to) {
        if (!this.reverseEdges.has(to)) {
            this.reverseEdges.set(to, new Set());
        }
        this.reverseEdges.get(to)?.add(from);
    }
    incrementInDegree(taskId) {
        const node = this.nodes.get(taskId);
        if (node)
            node.inDegree++;
    }
    /**
     * Remove a dependency between two tasks.
     * @param from - The source task
     * @param to - The dependent task
     * @returns true if dependency was removed, false if it didn't exist
     */
    removeDependency(from, to) {
        const edges = this.edges.get(from);
        if (!edges?.has(to)) {
            return false;
        }
        edges.delete(to);
        if (edges.size === 0) {
            this.edges.delete(from);
        }
        // Remove reverse edge
        const revEdges = this.reverseEdges.get(to);
        if (revEdges) {
            revEdges.delete(from);
            if (revEdges.size === 0) {
                this.reverseEdges.delete(to);
            }
        }
        // Decrement in-degree
        const toNode = this.nodes.get(to);
        if (toNode && toNode.inDegree > 0) {
            toNode.inDegree--;
        }
        return true;
    }
    /**
     * Get the in-degree (number of dependencies) for a task.
     */
    getInDegree(taskId) {
        const node = this.nodes.get(taskId);
        return node?.inDegree ?? 0;
    }
    /**
     * Get the out-degree (number of dependents) for a task.
     */
    getOutDegree(taskId) {
        return this.edges.get(taskId)?.size ?? 0;
    }
    /**
     * Get all task IDs in the graph.
     */
    getTaskIds() {
        return Array.from(this.nodes.keys());
    }
    /**
     * Get a task by ID.
     */
    getTask(taskId) {
        return this.nodes.get(taskId)?.task;
    }
    /**
     * Check if a task exists in the graph.
     */
    hasTask(taskId) {
        return this.nodes.has(taskId);
    }
    /**
     * Get the number of tasks in the graph.
     */
    get size() {
        return this.nodes.size;
    }
    /**
     * Get the number of edges in the graph.
     */
    get edgeCount() {
        let count = 0;
        for (const edges of this.edges.values()) {
            count += edges.size;
        }
        return count;
    }
    /**
     * Validate the graph structure.
     * Checks for cycles, missing dependencies, and other issues.
     */
    validate() {
        return validateGraph(this.nodes, this.edges, this.reverseEdges);
    }
    /**
     * Get comprehensive statistics about the graph.
     */
    getStats() {
        return getGraphStatsForGraph(this.nodes, this.edges);
    }
    /**
     * Get tasks in topological order (Kahn's Algorithm).
     * Tasks appear before their dependents.
     * @throws {Error} If circular dependency detected
     */
    getTopologicalOrder() {
        return getTopologicalOrderForGraph(this.nodes, this.edges);
    }
    /**
     * Detect circular dependencies using DFS.
     * @returns Array of cycles (each cycle is an array of task IDs), or null if acyclic
     */
    detectCycles() {
        return detectCyclesInGraph(this.nodes, this.edges);
    }
    /**
     * Check if the graph contains any cycles.
     * @returns true if cycles exist, false if acyclic
     */
    hasCycle() {
        const cycles = this.detectCycles();
        return cycles !== null && cycles.length > 0;
    }
    /**
     * Get the critical path (longest dependency chain).
     * This is the sequence of tasks that determines the minimum execution time.
     *
     * IMPORTANT: For optimal parallel scheduling, the invariant |waves| = |critical_path| must hold.
     *
     * Returns:
     * - Empty array for empty graph
     * - Single task for single-node graph (critical path length = 1)
     * - Single task if all tasks are independent (critical path length = 1, same as wave count)
     * - Longest dependency chain for graphs with dependencies
     */
    getCriticalPath() {
        return getCriticalPathForGraph(this.nodes, this.edges);
    }
    /**
     * Get the maximum number of tasks that can run in parallel.
     */
    getMaxParallelWidth() {
        const waves = getWavesForGraph(this.nodes, this.edges);
        let maxWidth = 0;
        for (const wave of waves) {
            maxWidth = Math.max(maxWidth, wave.length);
        }
        return maxWidth;
    }
    /**
     * Group tasks into waves (batches) for parallel execution.
     * Tasks in the same wave have no dependencies on each other.
     * Each wave must complete before the next wave starts.
     */
    getWaves() {
        return getWavesForGraph(this.nodes, this.edges);
    }
    /**
     * Get direct dependencies of a task.
     */
    getDependencies(taskId) {
        return Array.from(this.reverseEdges.get(taskId) ?? []);
    }
    /**
     * Get direct dependents of a task (tasks that depend on this one).
     */
    getDependents(taskId) {
        return Array.from(this.edges.get(taskId) ?? []);
    }
    /**
     * Get all transitive dependencies of a task (including indirect).
     */
    getTransitiveDependencies(taskId) {
        const visited = new Set();
        const stack = [...(this.reverseEdges.get(taskId) ?? [])];
        while (stack.length > 0) {
            // Safe: loop condition ensures stack is non-empty
            const dep = stack.pop();
            if (!dep)
                break;
            if (visited.has(dep))
                continue;
            visited.add(dep);
            stack.push(...(this.reverseEdges.get(dep) ?? []));
        }
        return Array.from(visited);
    }
    /**
     * Get all transitive dependents of a task (including indirect).
     */
    getTransitiveDependents(taskId) {
        const visited = new Set();
        const stack = [...(this.edges.get(taskId) ?? [])];
        while (stack.length > 0) {
            // Safe: loop condition ensures stack is non-empty
            const dep = stack.pop();
            if (!dep)
                break;
            if (visited.has(dep))
                continue;
            visited.add(dep);
            stack.push(...(this.edges.get(dep) ?? []));
        }
        return Array.from(visited);
    }
    /**
     * Create a subgraph containing only the specified tasks and their edges.
     */
    subgraph(taskIds) {
        const sub = new TaskGraph();
        const idSet = new Set(taskIds);
        this.copyTasksToSubgraph(taskIds, sub);
        this.copyEdgesToSubgraph(taskIds, idSet, sub);
        return sub;
    }
    copyTasksToSubgraph(taskIds, sub) {
        for (const id of taskIds) {
            const node = this.nodes.get(id);
            if (node)
                sub.addTask({ ...node.task, dependencies: [] });
        }
    }
    copyEdgesToSubgraph(taskIds, idSet, sub) {
        for (const id of taskIds) {
            this.copyNodeEdgesToSubgraph(id, idSet, sub);
        }
    }
    copyNodeEdgesToSubgraph(id, idSet, sub) {
        const edges = this.edges.get(id);
        if (!edges)
            return;
        for (const to of edges) {
            if (idSet.has(to))
                sub.addDependency(id, to);
        }
    }
    /**
     * Clone the graph.
     */
    clone() {
        const cloned = new TaskGraph();
        this.copyAllTasks(cloned);
        this.copyAllEdges(cloned);
        return cloned;
    }
    copyAllTasks(target) {
        for (const [, node] of this.nodes) {
            target.addTask({ ...node.task });
        }
    }
    copyAllEdges(target) {
        for (const [from, edges] of this.edges) {
            for (const to of edges) {
                target.addDependency(from, to);
            }
        }
    }
}
export { CycleDetector };
//# sourceMappingURL=task-graph.js.map