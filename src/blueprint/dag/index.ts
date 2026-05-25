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

// Executor
export type {
  ConcurrencyConfig,
  ExecutionProgress,
  ExecutorOptions,
  ProgressCallback,
  TaskExecutorFn,
  TaskResult,
} from './executor.js'
export { createExecutor, createExecutorFromTasks, ParallelExecutor } from './executor.js'

// Interfaces (for dependency injection and testing)
export type {
  GraphStats,
  IClock,
  IFileSystem,
  IPackageGraph,
  ValidationResult,
} from './interfaces.js'
export { realClock } from './interfaces.js'

// Plan Parser
export type { ParsedPlan, PlanTask } from './plan-parser.js'
export { parsePlan, planTasksToGraphTasks } from './plan-parser.js'

// Task Graph
export { CycleDetector, TaskGraph } from './task-graph.js'
export type { Task, TaskNode } from './types.js'
