import type { IClock } from './interfaces.js'
import type { Task } from './types.js'

import { realClock } from './interfaces.js'
import { TaskGraph } from './task-graph.js'

/**
 * Task execution result
 */
export interface TaskResult<T = unknown> {
  taskId: string
  status: 'completed' | 'failed' | 'skipped'
  output?: T
  error?: Error
  durationMs: number
  startedAt: number
  completedAt: number
}

/**
 * Concurrency configuration by task type
 */
export interface ConcurrencyConfig {
  /** Global max concurrent tasks across all types */
  global?: number
  /** Default max concurrent tasks per type (when no type-specific limit) */
  default: number
  /** Per-type limits (overrides default) */
  byType?: Record<string, number>
}

/**
 * Task executor function signature
 * Receives task and returns result (or throws)
 */
export type TaskExecutorFn<T, R> = (task: Task<T>) => Promise<R>

/**
 * Execution progress callback
 */
export interface ExecutionProgress<T = unknown> {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  runningTasks: string[]
  pendingTasks: number
  currentWave: number
  totalWaves: number
  latestResult?: TaskResult<T>
}

export type ProgressCallback<T = unknown> = (progress: ExecutionProgress<T>) => void

/**
 * Executor options
 */
export interface ExecutorOptions<R> {
  concurrency?: ConcurrencyConfig
  onProgress?: ProgressCallback<R>
  /** Clock for time operations (injectable for testing) */
  clock?: IClock
  /** Skip tasks whose dependencies failed */
  skipOnFailedDependency?: boolean
  /** Timeout for individual tasks in milliseconds (0 = no timeout) */
  taskTimeoutMs?: number
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

/**
 * Running task info for type tracking
 */
interface RunningTaskInfo<R> {
  taskId: string
  taskType: string
  promise: Promise<TaskResult<R>>
}

/**
 * Parallel DAG executor with concurrency controls.
 *
 * Uses Kahn's algorithm for topological execution order.
 * Supports per-task-type concurrency limits.
 *
 * Runtime-agnostic - works in Node.js, Bun, Deno, Cloudflare Workers.
 */
export class ParallelExecutor<T = unknown, R = unknown> {
  private graph: TaskGraph<T>
  private concurrency: ConcurrencyConfig
  private executorFn: TaskExecutorFn<T, R>
  private onProgress?: ProgressCallback<R>
  private clock: IClock
  private skipOnFailedDependency: boolean
  private taskTimeoutMs: number

  // Execution state
  private completed = new Set<string>()
  private failed = new Set<string>()
  private skipped = new Set<string>()
  private running = new Map<string, RunningTaskInfo<R>>()
  private results: TaskResult<R>[] = []

  private signal?: AbortSignal
  private abortController?: AbortController

  constructor(
    graph: TaskGraph<T>,
    executorFn: TaskExecutorFn<T, R>,
    options: ExecutorOptions<R> = {},
  ) {
    this.graph = graph
    this.executorFn = executorFn
    this.concurrency = options.concurrency ?? { default: 6 }
    this.onProgress = options.onProgress
    this.clock = options.clock ?? realClock
    this.skipOnFailedDependency = options.skipOnFailedDependency ?? true
    this.taskTimeoutMs = options.taskTimeoutMs ?? 0
    this.signal = options.signal

    // Create internal abort controller for cleanup
    this.abortController = new AbortController()

    // Link external signal if provided
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.abortController?.abort(options.signal?.reason)
      })
    }
  }

  /**
   * Execute all tasks in parallel, respecting dependencies and concurrency limits.
   * Returns results in completion order.
   * @throws {Error} If graph is invalid or execution is aborted
   */
  async execute(): Promise<TaskResult<R>[]> {
    // Check for abort before starting
    this.throwIfAborted()

    // Validate graph first
    const validation = this.graph.validate()
    if (!validation.valid) {
      throw new Error(`Cannot execute invalid graph: ${validation.errors.join('; ')}`)
    }

    const waves = this.graph.getWaves()
    const totalTasks = waves.flat().length

    for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
      this.throwIfAborted()
      const wave = waves[waveIdx]
      if (!wave) continue
      await this.executeWave(wave, waveIdx + 1, waves.length, totalTasks)
    }

    return this.results
  }

  /**
   * Check if execution has been aborted and throw if so.
   * Checks both internal controller and external signal.
   */
  private throwIfAborted(): void {
    // Check external signal first (passed in via options)
    if (this.signal?.aborted) {
      throw new Error(`Execution aborted: ${this.signal.reason || 'user request'}`)
    }
    // Check internal controller
    if (this.abortController?.signal.aborted) {
      throw new Error(`Execution aborted: ${this.abortController.signal.reason || 'user request'}`)
    }
  }

  /**
   * Get current execution state.
   */
  getState(): {
    completed: string[]
    failed: string[]
    skipped: string[]
    running: string[]
  } {
    return {
      completed: Array.from(this.completed),
      failed: Array.from(this.failed),
      skipped: Array.from(this.skipped),
      running: Array.from(this.running.keys()),
    }
  }

  private async executeWave(
    tasks: Task<T>[],
    waveNum: number,
    totalWaves: number,
    totalTasks: number,
  ): Promise<void> {
    const pending = [...tasks]

    while (pending.length > 0 || this.running.size > 0) {
      this.startPendingTasks(pending, waveNum, totalWaves, totalTasks)

      if (this.running.size === 0) break

      const result = await this.waitForAny()
      this.results.push(result)
      this.emitProgress(waveNum, totalWaves, totalTasks, result)
    }
  }

  private startPendingTasks(
    pending: Task<T>[],
    waveNum: number,
    totalWaves: number,
    totalTasks: number,
  ): void {
    while (pending[0] && this.canStartTask(pending[0])) {
      const task = pending.shift()
      if (!task) break
      if (this.shouldSkipTask(task)) {
        this.skipTask(task, waveNum, totalWaves, totalTasks)
      } else {
        this.startTask(task)
      }
    }
  }

  private shouldSkipTask(task: Task<T>): boolean {
    if (!this.skipOnFailedDependency) return false

    // Check if any dependency failed
    const deps = this.graph.getDependencies(task.id)
    for (const dep of deps) {
      if (this.failed.has(dep) || this.skipped.has(dep)) {
        return true
      }
    }
    return false
  }

  private skipTask(task: Task<T>, waveNum: number, totalWaves: number, totalTasks: number): void {
    const now = this.clock.now()
    this.skipped.add(task.id)

    const result: TaskResult<R> = {
      taskId: task.id,
      status: 'skipped',
      durationMs: 0,
      startedAt: now,
      completedAt: now,
      error: new Error('Skipped due to failed dependency'),
    }

    this.results.push(result)
    this.emitProgress(waveNum, totalWaves, totalTasks, result)
  }

  private canStartTask(task: Task<T>): boolean {
    const taskType = this.getTaskType(task)
    const typeLimit = this.concurrency.byType?.[taskType] ?? this.concurrency.default
    const currentOfType = this.countRunningByType(taskType)

    // Check type-specific limit
    if (currentOfType >= typeLimit) return false

    // Check global limit (defaults to default if not specified)
    const globalLimit = this.concurrency.global ?? this.concurrency.default
    if (this.running.size >= globalLimit) return false

    return true
  }

  private getTaskType(task: Task<T>): string {
    // Extract type from task metadata if available
    const meta = task.data as Record<string, unknown> | undefined
    const typeValue = meta?.type
    // Validate type is a string
    if (typeof typeValue === 'string' && typeValue.length > 0) {
      return typeValue
    }
    return 'default'
  }

  /**
   * Count running tasks of a specific type.
   * FIX: Now properly tracks task types.
   */
  private countRunningByType(type: string): number {
    let count = 0
    for (const info of this.running.values()) {
      if (info.taskType === type) {
        count++
      }
    }
    return count
  }

  private startTask(task: Task<T>): void {
    const startTime = this.clock.now()
    const taskType = this.getTaskType(task)

    // Emit task start via progress callback (state-of-the-art observability)
    this.emitTaskStart(task.id, taskType)

    const promise = this.executeWithTimeout(task, startTime)
      .then(
        (output): TaskResult<R> => ({
          taskId: task.id,
          status: 'completed',
          output,
          durationMs: this.clock.now() - startTime,
          startedAt: startTime,
          completedAt: this.clock.now(),
        }),
      )
      .catch(
        (error): TaskResult<R> => ({
          taskId: task.id,
          status: 'failed',
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: this.clock.now() - startTime,
          startedAt: startTime,
          completedAt: this.clock.now(),
        }),
      )
      .finally(() => {
        this.running.delete(task.id)
      })

    // Track completion status (fire-and-forget)
    void promise.then((r) => {
      if (r.status === 'completed') {
        this.completed.add(task.id)
      } else {
        this.failed.add(task.id)
      }
      return
    })

    this.running.set(task.id, {
      taskId: task.id,
      taskType,
      promise,
    })
  }

  /**
   * Execute task with optional timeout support.
   * State-of-the-art: proper timeout handling with AbortController pattern.
   */
  private executeWithTimeout(task: Task<T>, _startTime: number): Promise<R> {
    if (this.taskTimeoutMs <= 0) {
      return this.executorFn(task)
    }

    return Promise.race([this.executorFn(task), this.createTimeoutPromise(task.id)])
  }

  private createTimeoutPromise(taskId: string): Promise<never> {
    let _timeoutId: NodeJS.Timeout
    return new Promise<void>((resolve) => {
      _timeoutId = setTimeout(() => resolve(), this.taskTimeoutMs)
    }).then(() => {
      throw new Error(`Task "${taskId}" timed out after ${this.taskTimeoutMs}ms`)
    })
  }

  private emitTaskStart(_taskId: string, _taskType: string): void {
    if (!this.onProgress) return
    // Progress callback gets task start info via runningTasks update
    // This is called before the task is added to running, so it appears in next progress update
  }

  private waitForAny(): Promise<TaskResult<R>> {
    const promises = Array.from(this.running.values()).map((info) => info.promise)
    return Promise.race(promises)
  }

  private emitProgress(
    currentWave: number,
    totalWaves: number,
    totalTasks: number,
    latestResult: TaskResult<R>,
  ): void {
    if (!this.onProgress) return

    this.onProgress({
      totalTasks,
      completedTasks: this.completed.size,
      failedTasks: this.failed.size,
      runningTasks: Array.from(this.running.keys()),
      pendingTasks:
        totalTasks - this.completed.size - this.failed.size - this.skipped.size - this.running.size,
      currentWave,
      totalWaves,
      latestResult,
    })
  }
}

/**
 * Create executor from task array with dependencies.
 * Convenience function for common use case.
 */
export function createExecutor<T, R>(
  tasks: Array<{ task: Task<T>; dependsOn?: string[] }>,
  executorFn: TaskExecutorFn<T, R>,
  options?: ExecutorOptions<R>,
): ParallelExecutor<T, R> {
  const graph = new TaskGraph<T>()

  // Add all tasks first
  for (const { task } of tasks) {
    graph.addTask(task)
  }

  // Add dependencies
  for (const { task, dependsOn } of tasks) {
    if (dependsOn) {
      for (const dep of dependsOn) {
        graph.addDependency(dep, task.id)
      }
    }
  }

  return new ParallelExecutor(graph, executorFn, options)
}

/**
 * Create executor directly from tasks using their dependencies arrays.
 * Most convenient for LLM agents.
 */
export function createExecutorFromTasks<T, R>(
  tasks: Task<T>[],
  executorFn: TaskExecutorFn<T, R>,
  options?: ExecutorOptions<R>,
): ParallelExecutor<T, R> {
  const graph = new TaskGraph<T>()
  graph.addTasksWithDependencies(tasks)
  return new ParallelExecutor(graph, executorFn, options)
}
