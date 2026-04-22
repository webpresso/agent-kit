/**
 * agent-kit blueprint/dag
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
} from './executor'
export { createExecutor, createExecutorFromTasks, ParallelExecutor } from './executor'

// Interfaces (for dependency injection and testing)
export type { GraphStats, IClock, IFileSystem, IPackageGraph, ValidationResult } from './interfaces'
export { realClock } from './interfaces'

// Plan Parser
export type { ParsedPlan, PlanTask } from './plan-parser'
export { parsePlan, planTasksToGraphTasks } from './plan-parser'

// Task Graph
export { CycleDetector, TaskGraph } from './task-graph'
export type { Task, TaskNode } from './types'
