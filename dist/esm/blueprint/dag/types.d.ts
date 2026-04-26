/**
 * Generic task interface for DAG analysis.
 * Applications should extend this with their specific task data.
 */
export interface Task<T = unknown> {
    id: string;
    data?: T;
    dependencies: string[];
}
/**
 * Internal node representation in the graph.
 */
export interface TaskNode<T = unknown> {
    task: Task<T>;
    inDegree: number;
}
//# sourceMappingURL=types.d.ts.map