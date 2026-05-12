import type { IClock } from './interfaces.js';
import type { Task } from './types.js';
import { TaskGraph } from './task-graph.js';
/**
 * Task execution result
 */
export interface TaskResult<T = unknown> {
    taskId: string;
    status: 'completed' | 'failed' | 'skipped';
    output?: T;
    error?: Error;
    durationMs: number;
    startedAt: number;
    completedAt: number;
}
/**
 * Concurrency configuration by task type
 */
export interface ConcurrencyConfig {
    /** Global max concurrent tasks across all types */
    global?: number;
    /** Default max concurrent tasks per type (when no type-specific limit) */
    default: number;
    /** Per-type limits (overrides default) */
    byType?: Record<string, number>;
}
/**
 * Task executor function signature
 * Receives task and returns result (or throws)
 */
export type TaskExecutorFn<T, R> = (task: Task<T>) => Promise<R>;
/**
 * Execution progress callback
 */
export interface ExecutionProgress<T = unknown> {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    runningTasks: string[];
    pendingTasks: number;
    currentWave: number;
    totalWaves: number;
    latestResult?: TaskResult<T>;
}
export type ProgressCallback<T = unknown> = (progress: ExecutionProgress<T>) => void;
/**
 * Executor options
 */
export interface ExecutorOptions<R> {
    concurrency?: ConcurrencyConfig;
    onProgress?: ProgressCallback<R>;
    /** Clock for time operations (injectable for testing) */
    clock?: IClock;
    /** Skip tasks whose dependencies failed */
    skipOnFailedDependency?: boolean;
    /** Timeout for individual tasks in milliseconds (0 = no timeout) */
    taskTimeoutMs?: number;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
}
/**
 * Parallel DAG executor with concurrency controls.
 *
 * Uses Kahn's algorithm for topological execution order.
 * Supports per-task-type concurrency limits.
 *
 * Runtime-agnostic - works in Node.js, Bun, Deno, Cloudflare Workers.
 */
export declare class ParallelExecutor<T = unknown, R = unknown> {
    private graph;
    private concurrency;
    private executorFn;
    private onProgress?;
    private clock;
    private skipOnFailedDependency;
    private taskTimeoutMs;
    private completed;
    private failed;
    private skipped;
    private running;
    private results;
    private signal?;
    private abortController?;
    constructor(graph: TaskGraph<T>, executorFn: TaskExecutorFn<T, R>, options?: ExecutorOptions<R>);
    /**
     * Execute all tasks in parallel, respecting dependencies and concurrency limits.
     * Returns results in completion order.
     * @throws {Error} If graph is invalid or execution is aborted
     */
    execute(): Promise<TaskResult<R>[]>;
    /**
     * Check if execution has been aborted and throw if so.
     * Checks both internal controller and external signal.
     */
    private throwIfAborted;
    /**
     * Get current execution state.
     */
    getState(): {
        completed: string[];
        failed: string[];
        skipped: string[];
        running: string[];
    };
    private executeWave;
    private startPendingTasks;
    private shouldSkipTask;
    private skipTask;
    private canStartTask;
    private getTaskType;
    /**
     * Count running tasks of a specific type.
     * FIX: Now properly tracks task types.
     */
    private countRunningByType;
    private startTask;
    /**
     * Execute task with optional timeout support.
     * State-of-the-art: proper timeout handling with AbortController pattern.
     */
    private executeWithTimeout;
    private createTimeoutPromise;
    private emitTaskStart;
    private waitForAny;
    private emitProgress;
}
/**
 * Create executor from task array with dependencies.
 * Convenience function for common use case.
 */
export declare function createExecutor<T, R>(tasks: Array<{
    task: Task<T>;
    dependsOn?: string[];
}>, executorFn: TaskExecutorFn<T, R>, options?: ExecutorOptions<R>): ParallelExecutor<T, R>;
/**
 * Create executor directly from tasks using their dependencies arrays.
 * Most convenient for LLM agents.
 */
export declare function createExecutorFromTasks<T, R>(tasks: Task<T>[], executorFn: TaskExecutorFn<T, R>, options?: ExecutorOptions<R>): ParallelExecutor<T, R>;
//# sourceMappingURL=executor.d.ts.map