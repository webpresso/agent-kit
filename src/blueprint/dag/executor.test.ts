import { describe, expect, it, vi } from 'vitest'

import { createExecutor, ParallelExecutor } from './executor.js'
import { TaskGraph } from './task-graph.js'

describe('ParallelExecutor', () => {
  describe('basic execution', () => {
    it('executes all tasks in a simple chain', async () => {
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
      graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
      graph.addTask({ id: 'c', data: 'task-c', dependencies: ['b'] })

      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')

      const executor = new ParallelExecutor(graph, async (task) => `result-${task.id}`)

      const results = await executor.execute()

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.status === 'completed')).toBe(true)
    })

    it('executes independent tasks in parallel', async () => {
      vi.useFakeTimers()
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
      graph.addTask({ id: 'b', data: 'task-b', dependencies: [] })
      graph.addTask({ id: 'c', data: 'task-c', dependencies: [] })

      const executionOrder: string[] = []
      const executor = new ParallelExecutor(graph, async (task) => {
        executionOrder.push(`start-${task.id}`)
        // Deferred pattern for fake timers
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 10)
        await promise
        executionOrder.push(`end-${task.id}`)
        return task.id
      })

      const resultPromise = executor.execute()
      await vi.advanceTimersByTimeAsync(10)
      const results = await resultPromise

      vi.useRealTimers()
      expect(results).toHaveLength(3)
      // All starts should happen before any ends (parallel execution)
      const startIndices = executionOrder
        .filter((e) => e.startsWith('start'))
        .map((e) => executionOrder.indexOf(e))
      const endIndices = executionOrder
        .filter((e) => e.startsWith('end'))
        .map((e) => executionOrder.indexOf(e))

      // With parallel execution, starts happen first
      expect(Math.max(...startIndices)).toBeLessThan(Math.min(...endIndices))
    })

    it('handles empty graph', async () => {
      const graph = new TaskGraph<string>()
      const executor = new ParallelExecutor(graph, async (task) => task.id)

      const results = await executor.execute()

      expect(results).toHaveLength(0)
    })

    it('handles single task', async () => {
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'only', data: 'only-task', dependencies: [] })

      const executor = new ParallelExecutor(graph, async (task) => `done-${task.id}`)

      const results = await executor.execute()

      expect(results).toHaveLength(1)
      expect(results[0]?.status).toBe('completed')
      expect(results[0]?.output).toBe('done-only')
    })
  })

  describe('error handling', () => {
    it('captures task failures', async () => {
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'fail', data: 'will-fail', dependencies: [] })

      const executor = new ParallelExecutor(graph, async () => {
        throw new Error('Task failed intentionally')
      })

      const results = await executor.execute()

      expect(results).toHaveLength(1)
      expect(results[0]?.status).toBe('failed')
      expect(results[0]?.error?.message).toBe('Task failed intentionally')
    })

    it('converts non-Error throws to Error objects', async () => {
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'fail', data: 'will-fail', dependencies: [] })

      const executor = new ParallelExecutor(graph, async () => {
        throw 'string error' // eslint-disable-line @typescript-eslint/only-throw-error -- Test verifies error handling for non-Error edge case (string throw)
      })

      const results = await executor.execute()

      expect(results[0]?.status).toBe('failed')
      expect(results[0]?.error).toBeInstanceOf(Error)
      expect(results[0]?.error?.message).toBe('string error')
    })

    it('continues executing other tasks after failure', async () => {
      vi.useFakeTimers()
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
      graph.addTask({ id: 'b', data: 'task-b', dependencies: [] })
      graph.addTask({ id: 'c', data: 'task-c', dependencies: [] })

      const executor = new ParallelExecutor(graph, async (task) => {
        // Deferred pattern for fake timers
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 5)
        await promise
        if (task.id === 'b') throw new Error('B failed')
        return task.id
      })

      const resultPromise = executor.execute()
      await vi.advanceTimersByTimeAsync(10)
      const results = await resultPromise

      vi.useRealTimers()
      expect(results).toHaveLength(3)
      expect(results.filter((r) => r.status === 'completed')).toHaveLength(2)
      expect(results.filter((r) => r.status === 'failed')).toHaveLength(1)
    })
  })

  describe('progress callback', () => {
    it('calls progress callback after each task completion', async () => {
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
      graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })

      graph.addDependency('a', 'b')

      const progressUpdates: number[] = []
      const executor = new ParallelExecutor(graph, async (task) => task.id, {
        concurrency: { default: 6 },
        onProgress: (progress) => progressUpdates.push(progress.completedTasks),
      })

      await executor.execute()

      expect(progressUpdates).toContain(1)
    })

    it('provides correct progress metadata', async () => {
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
      graph.addTask({ id: 'b', data: 'task-b', dependencies: [] })

      let capturedProgress: { totalTasks: number; totalWaves: number } | null = null
      const executor = new ParallelExecutor(graph, async (task) => task.id, {
        concurrency: { default: 6 },
        onProgress: (progress) => {
          capturedProgress = { totalTasks: progress.totalTasks, totalWaves: progress.totalWaves }
        },
      })

      await executor.execute()

      expect(capturedProgress).not.toBeNull()
      expect(capturedProgress?.totalTasks).toBe(2)
      expect(capturedProgress?.totalWaves).toBe(1)
    })
  })

  describe('concurrency limits', () => {
    it('respects default concurrency limit', async () => {
      vi.useFakeTimers()
      const graph = new TaskGraph<string>()
      for (let i = 0; i < 10; i++) {
        graph.addTask({ id: `task-${i}`, data: `data-${i}`, dependencies: [] })
      }

      let maxConcurrent = 0
      let currentConcurrent = 0

      const executor = new ParallelExecutor(
        graph,
        async (task) => {
          currentConcurrent++
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
          // Deferred pattern for fake timers
          let resolve: () => void
          const promise = new Promise<void>((r) => {
            resolve = r
          })
          setTimeout(resolve!, 5)
          await promise
          currentConcurrent--
          return task.id
        },
        { concurrency: { default: 3 } },
      )

      const resultPromise = executor.execute()
      await vi.advanceTimersByTimeAsync(50)
      await resultPromise

      vi.useRealTimers()
      expect(maxConcurrent).toBeLessThanOrEqual(3)
    })
  })

  describe('timing', () => {
    it('records task duration', async () => {
      const graph = new TaskGraph<string>()
      graph.addTask({ id: 'slow', data: 'slow-task', dependencies: [] })

      let clockTime = 1000
      const mockClock = {
        now: () => clockTime,
      }

      const executor = new ParallelExecutor(
        graph,
        async () => {
          clockTime += 50
          return 'done'
        },
        { clock: mockClock },
      )

      const results = await executor.execute()

      expect(results[0]?.durationMs).toBe(50)
    })
  })
})

describe('ParallelExecutor - skip on failed dependency', () => {
  it('skips dependent tasks when skipOnFailedDependency is true (default)', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addTask({ id: 'c', data: 'task-c', dependencies: ['b'] })

    graph.addDependency('a', 'b')
    graph.addDependency('b', 'c')

    const executor = new ParallelExecutor(graph, async (task) => {
      if (task.id === 'a') throw new Error('A failed')
      return `result-${task.id}`
    })

    const results = await executor.execute()

    expect(results).toHaveLength(3)
    expect(results.find((r) => r.taskId === 'a')?.status).toBe('failed')
    expect(results.find((r) => r.taskId === 'b')?.status).toBe('skipped')
    expect(results.find((r) => r.taskId === 'c')?.status).toBe('skipped')
  })

  it('does not skip dependent tasks when skipOnFailedDependency is false', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })

    graph.addDependency('a', 'b')

    const executedTasks: string[] = []
    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        executedTasks.push(task.id)
        if (task.id === 'a') throw new Error('A failed')
        return `result-${task.id}`
      },
      { skipOnFailedDependency: false },
    )

    const results = await executor.execute()

    expect(executedTasks).toContain('a')
    expect(executedTasks).toContain('b')
    expect(results).toHaveLength(2)
    expect(results.find((r) => r.taskId === 'a')?.status).toBe('failed')
    expect(results.find((r) => r.taskId === 'b')?.status).toBe('completed')
  })

  it('skips tasks when dependency was skipped', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addTask({ id: 'c', data: 'task-c', dependencies: ['b'] })

    graph.addDependency('a', 'b')
    graph.addDependency('b', 'c')

    const executor = new ParallelExecutor(graph, async (task) => {
      if (task.id === 'a') throw new Error('A failed')
      return `result-${task.id}`
    })

    await executor.execute()
    const state = executor.getState()

    expect(state.failed).toContain('a')
    expect(state.skipped).toContain('b')
    expect(state.skipped).toContain('c')
  })
})

describe('ParallelExecutor - type-based concurrency', () => {
  it('respects per-type concurrency limits', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<{ type: string }>()
    graph.addTask({ id: 'a1', data: { type: 'lint' }, dependencies: [] })
    graph.addTask({ id: 'a2', data: { type: 'lint' }, dependencies: [] })
    graph.addTask({ id: 'a3', data: { type: 'lint' }, dependencies: [] })
    graph.addTask({ id: 'b1', data: { type: 'test' }, dependencies: [] })
    graph.addTask({ id: 'b2', data: { type: 'test' }, dependencies: [] })

    let maxLintConcurrent = 0
    let currentLintConcurrent = 0

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        const taskType = (task.data as { type: string }).type
        if (taskType === 'lint') {
          currentLintConcurrent++
          maxLintConcurrent = Math.max(maxLintConcurrent, currentLintConcurrent)
        }
        // Deferred pattern for fake timers
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 20)
        await promise
        if (taskType === 'lint') {
          currentLintConcurrent--
        }
        return task.id
      },
      { concurrency: { default: 10, byType: { lint: 2 } } },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(100)
    await resultPromise

    vi.useRealTimers()
    expect(maxLintConcurrent).toBeLessThanOrEqual(2)
  })

  it('uses default type for tasks without type metadata', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<null>()
    graph.addTask({ id: 'a', data: null, dependencies: [] })
    graph.addTask({ id: 'b', data: null, dependencies: [] })

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        // Deferred pattern for fake timers
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 5)
        await promise
        return task.id
      },
      {
        concurrency: { default: 2 },
      },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(10)
    const results = await resultPromise

    vi.useRealTimers()
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'completed')).toBe(true)
  })
})

describe('ParallelExecutor - global concurrency limit', () => {
  it('respects global limit separate from type default', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<{ type: string }>()
    // 6 tasks: 3 of type 'a', 3 of type 'b'
    for (let i = 0; i < 3; i++) {
      graph.addTask({ id: `a-${i}`, data: { type: 'a' }, dependencies: [] })
      graph.addTask({ id: `b-${i}`, data: { type: 'b' }, dependencies: [] })
    }

    let maxConcurrent = 0
    let currentConcurrent = 0

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        // Deferred pattern for fake timers
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 10)
        await promise
        currentConcurrent--
        return task.id
      },
      {
        concurrency: {
          global: 4, // Max 4 total concurrent
          default: 3, // Each type can have up to 3
        },
      },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(100)
    await resultPromise

    vi.useRealTimers()
    // Global limit of 4 should be respected, even though each type could have 3
    expect(maxConcurrent).toBeLessThanOrEqual(4)
    // We should have hit the global limit (4) at some point
    expect(maxConcurrent).toBe(4)
  })

  it('type limit can exceed default when global is higher', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<{ type: string }>()
    graph.addTask({ id: 'a1', data: { type: 'a' }, dependencies: [] })
    graph.addTask({ id: 'a2', data: { type: 'a' }, dependencies: [] })
    graph.addTask({ id: 'a3', data: { type: 'a' }, dependencies: [] })

    let maxConcurrent = 0
    let currentConcurrent = 0

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        // Deferred pattern for fake timers
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 5)
        await promise
        currentConcurrent--
        return task.id
      },
      {
        concurrency: {
          global: 10,
          default: 1, // Default per-type is 1
          byType: { a: 3 }, // But type 'a' can have 3
        },
      },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(20)
    await resultPromise

    vi.useRealTimers()
    // All 3 type 'a' tasks should run concurrently (limited by type limit of 3, not default of 1)
    expect(maxConcurrent).toBe(3)
  })
})

describe('ParallelExecutor - task timeout', () => {
  it('fails task that exceeds timeout', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'slow', data: 'slow-task', dependencies: [] })

    const executor = new ParallelExecutor(
      graph,
      async () => {
        // Task that never resolves on its own
        return new Promise(() => {
          // Never resolves
        })
      },
      { taskTimeoutMs: 1000 },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(1000)
    const results = await resultPromise

    vi.useRealTimers()
    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('failed')
    expect(results[0]?.error?.message).toContain('timed out')
    expect(results[0]?.error?.message).toContain('1000ms')
  })

  it('completes task that finishes before timeout', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'fast', data: 'fast-task', dependencies: [] })

    const executor = new ParallelExecutor(
      graph,
      async () => {
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 100)
        await promise
        return 'success'
      },
      { taskTimeoutMs: 1000 },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(100)
    const results = await resultPromise

    vi.useRealTimers()
    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('completed')
    expect(results[0]?.output).toBe('success')
  })

  it('no timeout when taskTimeoutMs is 0', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'task', data: 'task', dependencies: [] })

    const executor = new ParallelExecutor(graph, async () => 'done', { taskTimeoutMs: 0 })

    const results = await executor.execute()

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('completed')
  })
})

describe('ParallelExecutor - abort signal', () => {
  it('throws when aborted before execution starts', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })

    const controller = new AbortController()
    controller.abort('user cancellation')

    const executor = new ParallelExecutor(graph, async () => 'done', {
      signal: controller.signal,
    })

    await expect(executor.execute()).rejects.toThrow('user cancellation')
  })

  it('aborts between waves', async () => {
    const graph = new TaskGraph<string>()
    // First wave: independent tasks
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: [] })
    // Second wave: depends on first
    graph.addTask({ id: 'c', data: 'task-c', dependencies: ['a', 'b'] })

    graph.addDependency('a', 'c')
    graph.addDependency('b', 'c')

    const controller = new AbortController()
    let taskCompleted = false

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        // When first task completes, abort before second wave
        if (task.id === 'a' && !taskCompleted) {
          taskCompleted = true
          controller.abort('inter-wave abort')
        }
        return 'done'
      },
      { signal: controller.signal },
    )

    // Execution should reject due to abort
    await expect(executor.execute()).rejects.toThrow('inter-wave abort')
  })
})

describe('ParallelExecutor - validation', () => {
  it('throws when executing a graph with cycles', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: [] })
    graph.addDependency('a', 'b')
    graph.addDependency('b', 'a')

    const executor = new ParallelExecutor(graph, async (task) => task.id)

    await expect(executor.execute()).rejects.toThrow(/invalid graph.*Circular dependency/i)
  })
})

describe('createExecutor', () => {
  it('creates executor from task array', async () => {
    const tasks = [
      { task: { id: 'a', data: 'task-a', dependencies: [] } },
      { task: { id: 'b', data: 'task-b', dependencies: ['a'] }, dependsOn: ['a'] },
    ]

    const executor = createExecutor(tasks, async (task) => `result-${task.id}`)
    const results = await executor.execute()

    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'completed')).toBe(true)
  })

  it('handles tasks with no dependencies', async () => {
    vi.useFakeTimers()
    const tasks = [
      { task: { id: 'x', data: 'task-x', dependencies: [] } },
      { task: { id: 'y', data: 'task-y', dependencies: [] } },
    ]

    const executor = createExecutor(tasks, async (task) => {
      // Deferred pattern for fake timers
      let resolve: () => void
      const promise = new Promise<void>((r) => {
        resolve = r
      })
      setTimeout(resolve!, 5)
      await promise
      return task.id
    })
    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(10)
    const results = await resultPromise

    vi.useRealTimers()
    expect(results).toHaveLength(2)
  })

  it('passes concurrency config', async () => {
    vi.useFakeTimers()
    const tasks = [
      { task: { id: 'a', data: 'task-a', dependencies: [] } },
      { task: { id: 'b', data: 'task-b', dependencies: [] } },
      { task: { id: 'c', data: 'task-c', dependencies: [] } },
    ]

    let maxConcurrent = 0
    let currentConcurrent = 0

    const executor = createExecutor(
      tasks,
      async (task) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        // Deferred pattern for fake timers
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 10)
        await promise
        currentConcurrent--
        return task.id
      },
      { concurrency: { default: 2 } },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(30)
    await resultPromise

    vi.useRealTimers()
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('passes progress callback', async () => {
    const tasks = [{ task: { id: 'a', data: 'task-a', dependencies: [] } }]

    const progressFn = vi.fn<(...args: any[]) => unknown>()
    const executor = createExecutor(tasks, async (task) => task.id, {
      concurrency: { default: 6 },
      onProgress: progressFn,
    })

    await executor.execute()

    expect(progressFn).toHaveBeenCalledTimes(1)
  })
})

// ============================================================
// Mutation-killing tests for executor.ts
// ============================================================

describe('ParallelExecutor - default concurrency (line 112)', () => {
  it('uses default concurrency of 6 when no concurrency option is provided', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<string>()
    // Add 8 tasks, all independent — if default is 6, only 6 run at once
    for (let i = 0; i < 8; i++) {
      graph.addTask({ id: `t${i}`, data: `data-${i}`, dependencies: [] })
    }

    let maxConcurrent = 0
    let currentConcurrent = 0

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 10)
        await promise
        currentConcurrent--
        return task.id
      },
      // No options — concurrency should default to { default: 6 }
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(100)
    await resultPromise

    vi.useRealTimers()
    // With default of 6, max concurrent should be exactly 6 (not 5, not 7, not 8)
    expect(maxConcurrent).toBe(6)
  })
})

describe('ParallelExecutor - abort signal forwarding (lines 123-125)', () => {
  it('forwards external abort to internal controller with reason', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addDependency('a', 'b')

    const externalController = new AbortController()

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        if (task.id === 'a') {
          // After first task starts, abort externally
          externalController.abort('external reason')
        }
        return `result-${task.id}`
      },
      { signal: externalController.signal },
    )

    await expect(executor.execute()).rejects.toThrow('external reason')
    vi.useRealTimers()
  })

  it('does not throw when no signal is provided and execution completes', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })

    // No signal option at all
    const executor = new ParallelExecutor(graph, async (task) => `done-${task.id}`)
    const results = await executor.execute()

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('completed')
  })
})

describe('ParallelExecutor - wave iteration (lines 148-152)', () => {
  it('executes all waves in order and passes correct wave numbers to progress', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addTask({ id: 'c', data: 'task-c', dependencies: ['b'] })
    graph.addDependency('a', 'b')
    graph.addDependency('b', 'c')

    const waveNumbers: number[] = []
    const executor = new ParallelExecutor(graph, async (task) => `result-${task.id}`, {
      concurrency: { default: 6 },
      onProgress: (progress) => {
        waveNumbers.push(progress.currentWave)
      },
    })

    const results = await executor.execute()

    expect(results).toHaveLength(3)
    // Wave numbers should be 1-indexed: 1, 2, 3 (not 0, 1, 2)
    expect(waveNumbers).toEqual([1, 2, 3])
  })

  it('reports totalWaves correctly across all progress callbacks', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addDependency('a', 'b')

    const totalWavesValues: number[] = []
    const executor = new ParallelExecutor(graph, async (task) => `result-${task.id}`, {
      concurrency: { default: 6 },
      onProgress: (progress) => {
        totalWavesValues.push(progress.totalWaves)
      },
    })

    await executor.execute()

    // Both callbacks should report totalWaves=2
    expect(totalWavesValues).toEqual([2, 2])
  })
})

describe('ParallelExecutor - internal abort controller (line 168)', () => {
  it('checks internal abort controller signal separately from external signal', async () => {
    // This test ensures the internal abortController?.signal.aborted check matters.
    // We verify that when an external signal triggers abort, the internal controller
    // also gets aborted (via the addEventListener) and subsequent wave checks catch it.
    vi.useFakeTimers()
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addTask({ id: 'c', data: 'task-c', dependencies: ['b'] })
    graph.addDependency('a', 'b')
    graph.addDependency('b', 'c')

    const controller = new AbortController()

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        if (task.id === 'a') {
          controller.abort('stop now')
        }
        return task.id
      },
      { signal: controller.signal },
    )

    await expect(executor.execute()).rejects.toThrow('stop now')
    vi.useRealTimers()
  })
})

describe('ParallelExecutor - executeWave loop condition (line 198)', () => {
  it('continues wave loop while tasks are still running even if pending is empty', async () => {
    vi.useFakeTimers()
    // Two independent tasks: both start immediately (pending empties fast)
    // but they take time to complete (running > 0)
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: [] })

    const completionOrder: string[] = []

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, task.id === 'a' ? 10 : 20)
        await promise
        completionOrder.push(task.id)
        return task.id
      },
      { concurrency: { default: 10 } },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(10)
    const results = await resultPromise

    vi.useRealTimers()
    // Both tasks must complete (ensures loop didn't exit early when pending was empty)
    expect(results).toHaveLength(2)
    expect(completionOrder).toContain('a')
    expect(completionOrder).toContain('b')
  })

  it('exits wave loop when both pending and running are empty', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })

    const executor = new ParallelExecutor(graph, async () => 'done', {
      concurrency: { default: 10 },
    })

    const results = await executor.execute()

    // Should have exactly 1 result, loop exited properly
    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('completed')
  })
})

describe('ParallelExecutor - getTaskType empty string handling (line 276)', () => {
  it('returns "default" type when task data type is an empty string', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<{ type: string }>()
    graph.addTask({ id: 'a', data: { type: '' }, dependencies: [] })
    graph.addTask({ id: 'b', data: { type: '' }, dependencies: [] })
    graph.addTask({ id: 'c', data: { type: '' }, dependencies: [] })

    let maxConcurrent = 0
    let currentConcurrent = 0

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 10)
        await promise
        currentConcurrent--
        return task.id
      },
      {
        concurrency: {
          default: 1,
          byType: { '': 3 }, // If empty string were used as type, this would allow 3
        },
      },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(50)
    await resultPromise

    vi.useRealTimers()
    // Empty string type should fall back to 'default', limited by default: 1
    expect(maxConcurrent).toBe(1)
  })

  it('uses the string task type when it is non-empty', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<{ type: string }>()
    graph.addTask({ id: 'a', data: { type: 'custom' }, dependencies: [] })
    graph.addTask({ id: 'b', data: { type: 'custom' }, dependencies: [] })
    graph.addTask({ id: 'c', data: { type: 'custom' }, dependencies: [] })

    let maxConcurrent = 0
    let currentConcurrent = 0

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 10)
        await promise
        currentConcurrent--
        return task.id
      },
      {
        concurrency: {
          global: 10,
          default: 1,
          byType: { custom: 3 },
        },
      },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(20)
    await resultPromise

    vi.useRealTimers()
    // Non-empty string 'custom' should be recognized, allowing byType limit of 3
    // If it fell back to 'default', max would be 1
    expect(maxConcurrent).toBe(3)
  })

  it('returns "default" type when task data has non-string type', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<{ type: number }>()
    graph.addTask({ id: 'a', data: { type: 42 }, dependencies: [] })
    graph.addTask({ id: 'b', data: { type: 42 }, dependencies: [] })

    let maxConcurrent = 0
    let currentConcurrent = 0

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        let resolve: () => void
        const promise = new Promise<void>((r) => {
          resolve = r
        })
        setTimeout(resolve!, 10)
        await promise
        currentConcurrent--
        return task.id
      },
      {
        concurrency: {
          default: 1,
          byType: { '42': 2 }, // If type were coerced to string, this would allow 2
        },
      },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(30)
    await resultPromise

    vi.useRealTimers()
    // Non-string type should fall back to 'default', limited by default: 1
    expect(maxConcurrent).toBe(1)
  })
})

describe('ParallelExecutor - failed task durationMs (line 319)', () => {
  it('records correct durationMs for failed tasks using mock clock', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'fail-task', data: 'will-fail', dependencies: [] })

    let clockTime = 1000
    const mockClock = { now: () => clockTime }

    const executor = new ParallelExecutor(
      graph,
      async () => {
        clockTime += 75
        throw new Error('intentional failure')
      },
      { clock: mockClock },
    )

    const results = await executor.execute()

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('failed')
    expect(results[0]?.durationMs).toBe(75)
    expect(results[0]?.startedAt).toBe(1000)
  })
})

describe('ParallelExecutor - emitTaskStart no-op (lines 367-368)', () => {
  it('does not throw when onProgress is undefined and tasks run', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })

    // No onProgress callback — emitTaskStart should silently return
    const executor = new ParallelExecutor(graph, async (task) => `done-${task.id}`)
    const results = await executor.execute()

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('completed')
  })

  it('calls onProgress for task completions but emitTaskStart is a no-op guard', async () => {
    const graph = new TaskGraph<{ type: string }>()
    graph.addTask({ id: 'a', data: { type: 'lint' }, dependencies: [] })

    const progressCalls: Array<{ runningTasks: string[]; completedTasks: number }> = []
    const executor = new ParallelExecutor(graph, async (task) => `done-${task.id}`, {
      concurrency: { default: 6 },
      onProgress: (progress) => {
        progressCalls.push({
          runningTasks: [...progress.runningTasks],
          completedTasks: progress.completedTasks,
        })
      },
    })

    await executor.execute()

    // At least one progress call should have happened
    expect(progressCalls.length).toBeGreaterThanOrEqual(1)
  })
})

describe('ParallelExecutor - pendingTasks calculation (line 392)', () => {
  it('calculates pendingTasks correctly by subtracting completed, failed, skipped, and running', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: [] })
    graph.addTask({ id: 'c', data: 'task-c', dependencies: [] })
    graph.addTask({ id: 'd', data: 'task-d', dependencies: [] })
    graph.addTask({ id: 'e', data: 'task-e', dependencies: [] })

    const pendingValues: number[] = []
    const executor = new ParallelExecutor(graph, async (task) => `done-${task.id}`, {
      concurrency: { default: 2 },
      onProgress: (progress) => {
        pendingValues.push(progress.pendingTasks)
      },
    })

    await executor.execute()

    // With 5 tasks and concurrency 2, first completions should show pending > 0
    // Last completion should show pendingTasks = 0
    expect(pendingValues[pendingValues.length - 1]).toBe(0)
    // First completion: 5 total - 1 completed - 0 failed - 0 skipped - 1 running = 3
    // (1 just completed, 1 still running, 3 pending)
    expect(pendingValues[0]).toBeGreaterThan(0)
  })

  it('pendingTasks accounts for skipped tasks in subtraction', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addTask({ id: 'c', data: 'task-c', dependencies: ['a'] })
    graph.addDependency('a', 'b')
    graph.addDependency('a', 'c')

    const allProgress: Array<{
      pendingTasks: number
      completedTasks: number
      failedTasks: number
    }> = []

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        if (task.id === 'a') throw new Error('A failed')
        return `done-${task.id}`
      },
      {
        concurrency: { default: 6 },
        skipOnFailedDependency: true,
        onProgress: (progress) => {
          allProgress.push({
            pendingTasks: progress.pendingTasks,
            completedTasks: progress.completedTasks,
            failedTasks: progress.failedTasks,
          })
        },
      },
    )

    const results = await executor.execute()

    expect(results).toHaveLength(3)
    // After all are done: 0 completed + 1 failed + 2 skipped + 0 running = 3
    // pendingTasks = 3 - 0 - 1 - 2 - 0 = 0
    const lastProgress = allProgress[allProgress.length - 1]
    expect(lastProgress?.pendingTasks).toBe(0)
  })

  it('reports exact pendingTasks values through execution of sequential tasks', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addTask({ id: 'c', data: 'task-c', dependencies: ['b'] })
    graph.addDependency('a', 'b')
    graph.addDependency('b', 'c')

    const pendingValues: number[] = []
    const executor = new ParallelExecutor(graph, async (task) => `done-${task.id}`, {
      concurrency: { default: 6 },
      onProgress: (progress) => {
        pendingValues.push(progress.pendingTasks)
      },
    })

    await executor.execute()

    // Three sequential tasks:
    // After a completes: 3 - 1 completed - 0 failed - 0 skipped - 0 running = 2
    // After b completes: 3 - 2 completed - 0 failed - 0 skipped - 0 running = 1
    // After c completes: 3 - 3 completed - 0 failed - 0 skipped - 0 running = 0
    expect(pendingValues).toEqual([2, 1, 0])
  })
})

describe('ParallelExecutor - skipped task result properties', () => {
  it('skipped tasks have durationMs of exactly 0', async () => {
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addDependency('a', 'b')

    const executor = new ParallelExecutor(graph, async (task) => {
      if (task.id === 'a') throw new Error('fail')
      return task.id
    })

    const results = await executor.execute()
    const skippedResult = results.find((r) => r.taskId === 'b')

    expect(skippedResult?.status).toBe('skipped')
    expect(skippedResult?.durationMs).toBe(0)
    expect(skippedResult?.error?.message).toBe('Skipped due to failed dependency')
  })

  it('skipped task startedAt equals completedAt', async () => {
    let clockTime = 5000
    const mockClock = { now: () => clockTime }

    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: ['a'] })
    graph.addDependency('a', 'b')

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        clockTime += 100
        if (task.id === 'a') throw new Error('fail')
        return task.id
      },
      { clock: mockClock },
    )

    const results = await executor.execute()
    const skippedResult = results.find((r) => r.taskId === 'b')

    expect(skippedResult?.startedAt).toBe(skippedResult?.completedAt)
  })
})

describe('ParallelExecutor - getState reflects execution (line 217)', () => {
  it('getState shows correct completed and running states', async () => {
    vi.useFakeTimers()
    const graph = new TaskGraph<string>()
    graph.addTask({ id: 'a', data: 'task-a', dependencies: [] })
    graph.addTask({ id: 'b', data: 'task-b', dependencies: [] })

    let capturedState: ReturnType<ParallelExecutor<string, string>['getState']> | null = null

    const executor = new ParallelExecutor(
      graph,
      async (task) => {
        if (task.id === 'b') {
          // Capture state while 'b' is running
          capturedState = executor.getState()
        }
        return `done-${task.id}`
      },
      { concurrency: { default: 1 } },
    )

    const resultPromise = executor.execute()
    await vi.advanceTimersByTimeAsync(10)
    await resultPromise

    vi.useRealTimers()

    // When task 'b' was running, 'a' should have been completed
    expect(capturedState).not.toBeNull()
    expect(capturedState!.completed).toContain('a')
  })
})
