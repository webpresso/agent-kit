/**
 * webpresso blueprint/dag
 *
 * Workers-safe DAG (Directed Acyclic Graph) analysis utilities.
 * Zero Node.js dependencies — safe for Cloudflare Workers, Deno, Bun, and Node.js.
 *
 * For Node-only utilities (PackageGraph, IndependenceDetector),
 * use the `dag/local` subpath instead.
 *
 * @packageDocumentation
 */
export { createExecutor, createExecutorFromTasks, ParallelExecutor } from './executor.js';
export { realClock } from './interfaces.js';
export { parsePlan, planTasksToGraphTasks } from './plan-parser.js';
// Task Graph
export { CycleDetector, TaskGraph } from './task-graph.js';
//# sourceMappingURL=index.js.map