import type { GraphStats, ValidationResult } from './interfaces.js';
import type { Task } from './types.js';
import { CycleDetector } from './cycle-detector.js';
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
export declare class TaskGraph<T = unknown> {
    private nodes;
    private edges;
    private reverseEdges;
    constructor();
    /**
     * Add a task to the graph.
     * Must be called before adding dependencies.
     */
    addTask(task: Task<T>): void;
    /**
     * Add a task and automatically wire up its dependencies.
     * This is the preferred method for LLM agents - single call instead of addTask + addDependency.
     *
     * @param task - Task with dependencies array populated
     * @throws {Error} If task already exists or dependencies reference non-existent tasks
     */
    addTaskWithDependencies(task: Task<T>): void;
    /**
     * Bulk add tasks with automatic dependency wiring.
     * Tasks are sorted by dependency depth before adding.
     *
     * @param tasks - Array of tasks to add
     * @throws {Error} If circular dependencies detected or tasks reference non-existent dependencies
     */
    addTasksWithDependencies(tasks: Task<T>[]): void;
    /**
     * Add a dependency between two tasks.
     * @param from - The task that must complete first
     * @param to - The task that depends on `from`
     * @throws {Error} If tasks don't exist, self-loop detected
     */
    addDependency(from: string, to: string): void;
    private validateDependencyNodes;
    private edgeExists;
    private addForwardEdge;
    private addReverseEdge;
    private incrementInDegree;
    /**
     * Remove a dependency between two tasks.
     * @param from - The source task
     * @param to - The dependent task
     * @returns true if dependency was removed, false if it didn't exist
     */
    removeDependency(from: string, to: string): boolean;
    /**
     * Get the in-degree (number of dependencies) for a task.
     */
    getInDegree(taskId: string): number;
    /**
     * Get the out-degree (number of dependents) for a task.
     */
    getOutDegree(taskId: string): number;
    /**
     * Get all task IDs in the graph.
     */
    getTaskIds(): string[];
    /**
     * Get a task by ID.
     */
    getTask(taskId: string): Task<T> | undefined;
    /**
     * Check if a task exists in the graph.
     */
    hasTask(taskId: string): boolean;
    /**
     * Get the number of tasks in the graph.
     */
    get size(): number;
    /**
     * Get the number of edges in the graph.
     */
    get edgeCount(): number;
    /**
     * Validate the graph structure.
     * Checks for cycles, missing dependencies, and other issues.
     */
    validate(): ValidationResult;
    /**
     * Get comprehensive statistics about the graph.
     */
    getStats(): GraphStats;
    /**
     * Get tasks in topological order (Kahn's Algorithm).
     * Tasks appear before their dependents.
     * @throws {Error} If circular dependency detected
     */
    getTopologicalOrder(): Task<T>[];
    /**
     * Detect circular dependencies using DFS.
     * @returns Array of cycles (each cycle is an array of task IDs), or null if acyclic
     */
    detectCycles(): string[][] | null;
    /**
     * Check if the graph contains any cycles.
     * @returns true if cycles exist, false if acyclic
     */
    hasCycle(): boolean;
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
    getCriticalPath(): Task<T>[];
    /**
     * Get the maximum number of tasks that can run in parallel.
     */
    getMaxParallelWidth(): number;
    /**
     * Group tasks into waves (batches) for parallel execution.
     * Tasks in the same wave have no dependencies on each other.
     * Each wave must complete before the next wave starts.
     */
    getWaves(): Task<T>[][];
    /**
     * Get direct dependencies of a task.
     */
    getDependencies(taskId: string): string[];
    /**
     * Get direct dependents of a task (tasks that depend on this one).
     */
    getDependents(taskId: string): string[];
    /**
     * Get all transitive dependencies of a task (including indirect).
     */
    getTransitiveDependencies(taskId: string): string[];
    /**
     * Get all transitive dependents of a task (including indirect).
     */
    getTransitiveDependents(taskId: string): string[];
    /**
     * Create a subgraph containing only the specified tasks and their edges.
     */
    subgraph(taskIds: string[]): TaskGraph<T>;
    private copyTasksToSubgraph;
    private copyEdgesToSubgraph;
    private copyNodeEdgesToSubgraph;
    /**
     * Clone the graph.
     */
    clone(): TaskGraph<T>;
    private copyAllTasks;
    private copyAllEdges;
}
export { CycleDetector };
//# sourceMappingURL=task-graph.d.ts.map