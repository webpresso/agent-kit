import type { GraphStats, ValidationResult } from './interfaces.js';
import type { Task, TaskNode } from './types.js';
type NodesMap<T> = Map<string, TaskNode<T>>;
type EdgesMap = Map<string, Set<string>>;
export declare function topologicalSortTasksInput<T>(tasks: Task<T>[], taskMap: Map<string, Task<T>>): Task<T>[];
export declare function getTopologicalOrderForGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): Task<T>[];
export declare function detectCyclesInGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): string[][] | null;
export declare function getCriticalPathForGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): Task<T>[];
export declare function getWavesForGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): Task<T>[][];
export declare function validateGraph<T>(nodes: NodesMap<T>, edges: EdgesMap, reverseEdges: EdgesMap): ValidationResult;
export declare function getGraphStatsForGraph<T>(nodes: NodesMap<T>, edges: EdgesMap): GraphStats;
export {};
//# sourceMappingURL=task-graph-algorithms.d.ts.map