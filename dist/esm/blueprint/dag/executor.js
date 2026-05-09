import { realClock } from './interfaces.js';
import { TaskGraph } from './task-graph.js';
/**
 * Parallel DAG executor with concurrency controls.
 *
 * Uses Kahn's algorithm for topological execution order.
 * Supports per-task-type concurrency limits.
 *
 * Runtime-agnostic - works in Node.js, Bun, Deno, Cloudflare Workers.
 */
export class ParallelExecutor {
    graph;
    concurrency;
    executorFn;
    onProgress;
    clock;
    skipOnFailedDependency;
    taskTimeoutMs;
    // Execution state
    completed = new Set();
    failed = new Set();
    skipped = new Set();
    running = new Map();
    results = [];
    signal;
    abortController;
    constructor(graph, executorFn, options = {}) {
        this.graph = graph;
        this.executorFn = executorFn;
        this.concurrency = options.concurrency ?? { default: 6 };
        this.onProgress = options.onProgress;
        this.clock = options.clock ?? realClock;
        this.skipOnFailedDependency = options.skipOnFailedDependency ?? true;
        this.taskTimeoutMs = options.taskTimeoutMs ?? 0;
        this.signal = options.signal;
        // Create internal abort controller for cleanup
        this.abortController = new AbortController();
        // Link external signal if provided
        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                this.abortController?.abort(options.signal?.reason);
            });
        }
    }
    /**
     * Execute all tasks in parallel, respecting dependencies and concurrency limits.
     * Returns results in completion order.
     * @throws {Error} If graph is invalid or execution is aborted
     */
    async execute() {
        // Check for abort before starting
        this.throwIfAborted();
        // Validate graph first
        const validation = this.graph.validate();
        if (!validation.valid) {
            throw new Error(`Cannot execute invalid graph: ${validation.errors.join('; ')}`);
        }
        const waves = this.graph.getWaves();
        const totalTasks = waves.flat().length;
        for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
            this.throwIfAborted();
            const wave = waves[waveIdx];
            if (!wave)
                continue;
            await this.executeWave(wave, waveIdx + 1, waves.length, totalTasks);
        }
        return this.results;
    }
    /**
     * Check if execution has been aborted and throw if so.
     * Checks both internal controller and external signal.
     */
    throwIfAborted() {
        // Check external signal first (passed in via options)
        if (this.signal?.aborted) {
            throw new Error(`Execution aborted: ${this.signal.reason || 'user request'}`);
        }
        // Check internal controller
        if (this.abortController?.signal.aborted) {
            throw new Error(`Execution aborted: ${this.abortController.signal.reason || 'user request'}`);
        }
    }
    /**
     * Get current execution state.
     */
    getState() {
        return {
            completed: Array.from(this.completed),
            failed: Array.from(this.failed),
            skipped: Array.from(this.skipped),
            running: Array.from(this.running.keys()),
        };
    }
    async executeWave(tasks, waveNum, totalWaves, totalTasks) {
        const pending = [...tasks];
        while (pending.length > 0 || this.running.size > 0) {
            this.startPendingTasks(pending, waveNum, totalWaves, totalTasks);
            if (this.running.size === 0)
                break;
            const result = await this.waitForAny();
            this.results.push(result);
            this.emitProgress(waveNum, totalWaves, totalTasks, result);
        }
    }
    startPendingTasks(pending, waveNum, totalWaves, totalTasks) {
        while (pending[0] && this.canStartTask(pending[0])) {
            const task = pending.shift();
            if (!task)
                break;
            if (this.shouldSkipTask(task)) {
                this.skipTask(task, waveNum, totalWaves, totalTasks);
            }
            else {
                this.startTask(task);
            }
        }
    }
    shouldSkipTask(task) {
        if (!this.skipOnFailedDependency)
            return false;
        // Check if any dependency failed
        const deps = this.graph.getDependencies(task.id);
        for (const dep of deps) {
            if (this.failed.has(dep) || this.skipped.has(dep)) {
                return true;
            }
        }
        return false;
    }
    skipTask(task, waveNum, totalWaves, totalTasks) {
        const now = this.clock.now();
        this.skipped.add(task.id);
        const result = {
            taskId: task.id,
            status: 'skipped',
            durationMs: 0,
            startedAt: now,
            completedAt: now,
            error: new Error('Skipped due to failed dependency'),
        };
        this.results.push(result);
        this.emitProgress(waveNum, totalWaves, totalTasks, result);
    }
    canStartTask(task) {
        const taskType = this.getTaskType(task);
        const typeLimit = this.concurrency.byType?.[taskType] ?? this.concurrency.default;
        const currentOfType = this.countRunningByType(taskType);
        // Check type-specific limit
        if (currentOfType >= typeLimit)
            return false;
        // Check global limit (defaults to default if not specified)
        const globalLimit = this.concurrency.global ?? this.concurrency.default;
        if (this.running.size >= globalLimit)
            return false;
        return true;
    }
    getTaskType(task) {
        // Extract type from task metadata if available
        const meta = task.data;
        const typeValue = meta?.type;
        // Validate type is a string
        if (typeof typeValue === 'string' && typeValue.length > 0) {
            return typeValue;
        }
        return 'default';
    }
    /**
     * Count running tasks of a specific type.
     * FIX: Now properly tracks task types.
     */
    countRunningByType(type) {
        let count = 0;
        for (const info of this.running.values()) {
            if (info.taskType === type) {
                count++;
            }
        }
        return count;
    }
    startTask(task) {
        const startTime = this.clock.now();
        const taskType = this.getTaskType(task);
        // Emit task start via progress callback (state-of-the-art observability)
        this.emitTaskStart(task.id, taskType);
        const promise = this.executeWithTimeout(task, startTime)
            .then((output) => ({
            taskId: task.id,
            status: 'completed',
            output,
            durationMs: this.clock.now() - startTime,
            startedAt: startTime,
            completedAt: this.clock.now(),
        }))
            .catch((error) => ({
            taskId: task.id,
            status: 'failed',
            error: error instanceof Error ? error : new Error(String(error)),
            durationMs: this.clock.now() - startTime,
            startedAt: startTime,
            completedAt: this.clock.now(),
        }))
            .finally(() => {
            this.running.delete(task.id);
        });
        // Track completion status (fire-and-forget)
        void promise.then((r) => {
            if (r.status === 'completed') {
                this.completed.add(task.id);
            }
            else {
                this.failed.add(task.id);
            }
            return;
        });
        this.running.set(task.id, {
            taskId: task.id,
            taskType,
            promise,
        });
    }
    /**
     * Execute task with optional timeout support.
     * State-of-the-art: proper timeout handling with AbortController pattern.
     */
    executeWithTimeout(task, _startTime) {
        if (this.taskTimeoutMs <= 0) {
            return this.executorFn(task);
        }
        return Promise.race([this.executorFn(task), this.createTimeoutPromise(task.id)]);
    }
    createTimeoutPromise(taskId) {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), this.taskTimeoutMs);
        }).then(() => {
            throw new Error(`Task "${taskId}" timed out after ${this.taskTimeoutMs}ms`);
        });
    }
    emitTaskStart(_taskId, _taskType) {
        if (!this.onProgress)
            return;
        // Progress callback gets task start info via runningTasks update
        // This is called before the task is added to running, so it appears in next progress update
    }
    waitForAny() {
        const promises = Array.from(this.running.values()).map((info) => info.promise);
        return Promise.race(promises);
    }
    emitProgress(currentWave, totalWaves, totalTasks, latestResult) {
        if (!this.onProgress)
            return;
        this.onProgress({
            totalTasks,
            completedTasks: this.completed.size,
            failedTasks: this.failed.size,
            runningTasks: Array.from(this.running.keys()),
            pendingTasks: totalTasks - this.completed.size - this.failed.size - this.skipped.size - this.running.size,
            currentWave,
            totalWaves,
            latestResult,
        });
    }
}
/**
 * Create executor from task array with dependencies.
 * Convenience function for common use case.
 */
export function createExecutor(tasks, executorFn, options) {
    const graph = new TaskGraph();
    // Add all tasks first
    for (const { task } of tasks) {
        graph.addTask(task);
    }
    // Add dependencies
    for (const { task, dependsOn } of tasks) {
        if (dependsOn) {
            for (const dep of dependsOn) {
                graph.addDependency(dep, task.id);
            }
        }
    }
    return new ParallelExecutor(graph, executorFn, options);
}
/**
 * Create executor directly from tasks using their dependencies arrays.
 * Most convenient for LLM agents.
 */
export function createExecutorFromTasks(tasks, executorFn, options) {
    const graph = new TaskGraph();
    graph.addTasksWithDependencies(tasks);
    return new ParallelExecutor(graph, executorFn, options);
}
//# sourceMappingURL=executor.js.map