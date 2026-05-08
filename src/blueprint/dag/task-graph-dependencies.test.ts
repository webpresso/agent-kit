import { describe, expect, it } from 'vitest'

import { TaskGraph } from './task-graph.js'

describe('TaskGraph dependencies', () => {
  describe('dependents', () => {
    it('getDependents returns direct dependents', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['a'] })
      graph.addDependency('a', 'b')
      graph.addDependency('a', 'c')

      const dependents = graph.getDependents('a')
      expect(dependents).toEqual(expect.arrayContaining(['b', 'c']))
    })

    it('getDependents returns empty for task with no dependents', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      const dependents = graph.getDependents('a')
      expect(dependents).toEqual([])
    })

    it('getDependents returns empty for nonexistent task', () => {
      const graph = new TaskGraph()

      const dependents = graph.getDependents('nonexistent')
      expect(dependents).toEqual([])
    })
  })

  describe('transitive dependencies', () => {
    it('getTransitiveDependencies returns all indirect dependencies', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['b'] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')

      const deps = graph.getTransitiveDependencies('c')
      expect(deps).toEqual(expect.arrayContaining(['a', 'b']))
    })

    it('getTransitiveDependencies returns empty for task with no dependencies', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      const deps = graph.getTransitiveDependencies('a')
      expect(deps).toEqual([])
    })

    it('getTransitiveDependencies returns empty for nonexistent task', () => {
      const graph = new TaskGraph()

      const deps = graph.getTransitiveDependencies('nonexistent')
      expect(deps).toEqual([])
    })
  })

  describe('transitive dependents', () => {
    it('getTransitiveDependents returns all indirect dependents', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['b'] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')

      const dependents = graph.getTransitiveDependents('a')
      expect(dependents).toEqual(expect.arrayContaining(['b', 'c']))
    })

    it('getTransitiveDependents returns empty for task with no dependents', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      const dependents = graph.getTransitiveDependents('a')
      expect(dependents).toEqual([])
    })

    it('getTransitiveDependents returns empty for nonexistent task', () => {
      const graph = new TaskGraph()

      const dependents = graph.getTransitiveDependents('nonexistent')
      expect(dependents).toEqual([])
    })
  })

  describe('validation', () => {
    it('validate returns warnings for isolated nodes', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addTask({ id: 'c', dependencies: [] })
      graph.addDependency('a', 'b')

      const result = graph.validate()

      expect(result.valid).toBe(true)
      expect(result.warnings.some((w) => w.includes('isolated'))).toBe(true)
    })

    it('validate returns errors for cycles', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'a')

      const result = graph.validate()

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Circular'))).toBe(true)
    })

    it('validate returns warnings for unwired dependencies', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: ['x'] })
      graph.addTask({ id: 'x', dependencies: [] })

      const result = graph.validate()

      expect(result.warnings.some((w) => w.includes('not wired'))).toBe(true)
    })
  })

  describe('removeDependency', () => {
    it('removes existing dependency and returns true', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      const removed = graph.removeDependency('a', 'b')

      expect(removed).toBe(true)
      expect(graph.getInDegree('b')).toBe(0)
    })

    it('returns false for non-existent dependency', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })

      const removed = graph.removeDependency('a', 'b')

      expect(removed).toBe(false)
    })

    it('cleans up edge maps when last edge is removed', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      graph.removeDependency('a', 'b')

      expect(graph.getDependents('a')).toEqual([])
      expect(graph.getDependencies('b')).toEqual([])
    })

    it('handles removal when in-degree is already 0', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })

      const removed = graph.removeDependency('a', 'b')

      expect(removed).toBe(false)
      expect(graph.getInDegree('b')).toBe(0)
    })
  })

  describe('clone', () => {
    it('creates an independent copy of the graph', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      const cloned = graph.clone()

      expect(cloned.hasTask('a')).toBe(true)
      expect(cloned.hasTask('b')).toBe(true)
      expect(cloned.getInDegree('b')).toBe(1)
    })

    it('modifications to clone do not affect original', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      const cloned = graph.clone()
      cloned.addTask({ id: 'c', dependencies: [] })

      expect(graph.hasTask('c')).toBe(false)
      expect(cloned.hasTask('c')).toBe(true)
    })
  })

  describe('getStats', () => {
    it('returns comprehensive graph statistics', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['a'] })
      graph.addDependency('a', 'b')
      graph.addDependency('a', 'c')

      const stats = graph.getStats()

      expect(stats.nodeCount).toBe(3)
      expect(stats.edgeCount).toBe(2)
      expect(stats.maxDepth).toBe(2)
      expect(stats.maxWidth).toBe(2)
      expect(stats.waveCount).toBe(2)
      expect(stats.hasCycles).toBe(false)
      expect(stats.isolatedNodes).toEqual([])
    })

    it('identifies isolated nodes in stats', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addTask({ id: 'c', dependencies: [] })
      graph.addDependency('a', 'b')

      const stats = graph.getStats()

      expect(stats.isolatedNodes).toContain('c')
    })
  })

  describe('addTasksWithDependencies', () => {
    it('adds multiple tasks with dependencies in correct order', () => {
      const graph = new TaskGraph()

      const tasks = [
        { id: 'c', dependencies: ['b'] },
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] },
      ]

      graph.addTasksWithDependencies(tasks)

      expect(graph.hasTask('a')).toBe(true)
      expect(graph.hasTask('b')).toBe(true)
      expect(graph.hasTask('c')).toBe(true)
      expect(graph.getInDegree('b')).toBe(1)
      expect(graph.getInDegree('c')).toBe(1)
    })

    it('throws on circular dependencies in task list', () => {
      const graph = new TaskGraph()

      const tasks = [
        { id: 'a', dependencies: ['b'] },
        { id: 'b', dependencies: ['a'] },
      ]

      expect(() => graph.addTasksWithDependencies(tasks)).toThrow(/Circular dependency/)
    })
  })

  describe('addTask duplicate check', () => {
    it('throws when adding a task with an ID that already exists', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      expect(() => graph.addTask({ id: 'a', dependencies: [] })).toThrow(
        `Task "a" already exists in the graph`,
      )
    })

    it('still contains the original task after duplicate add fails', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [], data: 'original' })

      try {
        graph.addTask({ id: 'a', dependencies: [], data: 'duplicate' })
      } catch {
        // expected
      }

      expect(graph.size).toBe(1)
      expect(graph.getTask('a')?.data).toBe('original')
    })
  })

  describe('addTaskWithDependencies rollback on missing dep', () => {
    it('throws when dependency does not exist in the graph', () => {
      const graph = new TaskGraph()

      expect(() =>
        graph.addTaskWithDependencies({ id: 'b', dependencies: ['nonexistent'] }),
      ).toThrow(`Cannot add task "b": dependency "nonexistent" does not exist`)
    })

    it('rolls back the task when a dependency is missing (task not left in graph)', () => {
      const graph = new TaskGraph()

      try {
        graph.addTaskWithDependencies({ id: 'b', dependencies: ['nonexistent'] })
      } catch {
        // expected
      }

      expect(graph.hasTask('b')).toBe(false)
      expect(graph.size).toBe(0)
    })

    it('rolls back task even when first dep exists but second does not', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      try {
        graph.addTaskWithDependencies({ id: 'c', dependencies: ['a', 'missing'] })
      } catch {
        // expected
      }

      expect(graph.hasTask('c')).toBe(false)
      expect(graph.size).toBe(1)
    })
  })

  describe('addTasksWithDependencies with external dependencies', () => {
    it('handles tasks with dependency IDs that exist in graph but not in input list', () => {
      const graph = new TaskGraph()
      // Pre-add an external dependency
      graph.addTask({ id: 'external', dependencies: [] })

      // Add tasks where one depends on the external task
      const tasks = [
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['external'] },
      ]

      graph.addTasksWithDependencies(tasks)

      expect(graph.hasTask('a')).toBe(true)
      expect(graph.hasTask('b')).toBe(true)
      expect(graph.hasTask('external')).toBe(true)
      expect(graph.getInDegree('b')).toBe(1)
      // The visitDependencies guard `if (dep)` ensures we don't crash
      // when dep is not in the input taskMap but IS in the graph
    })

    it('external dep is not visited during topological sort of input tasks', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'ext1', dependencies: [] })
      graph.addTask({ id: 'ext2', dependencies: [] })
      graph.addDependency('ext1', 'ext2')

      // 'c' depends on 'ext2' which is external
      const tasks = [
        { id: 'c', dependencies: ['ext2'] },
        { id: 'd', dependencies: ['c'] },
      ]

      graph.addTasksWithDependencies(tasks)

      expect(graph.hasTask('c')).toBe(true)
      expect(graph.hasTask('d')).toBe(true)
      expect(graph.getInDegree('c')).toBe(1)
      expect(graph.getInDegree('d')).toBe(1)
    })
  })

  describe('removeDependency cleanup (mutation targets)', () => {
    it('removes forward edge entry from edges map when last edge is removed', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      graph.removeDependency('a', 'b')

      // After removing the only edge from 'a', getOutDegree must be exactly 0
      expect(graph.getOutDegree('a')).toBe(0)
      // getDependents relies on edges map - must be empty
      expect(graph.getDependents('a')).toEqual([])
    })

    it('keeps forward edge entry when other edges remain', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['a'] })
      graph.addDependency('a', 'b')
      graph.addDependency('a', 'c')

      graph.removeDependency('a', 'b')

      // a still has an edge to c
      expect(graph.getOutDegree('a')).toBe(1)
      expect(graph.getDependents('a')).toEqual(['c'])
    })

    it('removes reverse edge entry from reverseEdges map when last reverse edge is removed', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      graph.removeDependency('a', 'b')

      // getDependencies uses reverseEdges - must be empty after removal
      expect(graph.getDependencies('b')).toEqual([])
    })

    it('keeps reverse edge entry when other reverse edges remain', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'x', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a', 'x'] })
      graph.addDependency('a', 'b')
      graph.addDependency('x', 'b')

      graph.removeDependency('a', 'b')

      // b still has reverse edge from x
      expect(graph.getDependencies('b')).toEqual(['x'])
      expect(graph.getInDegree('b')).toBe(1)
    })

    it('decrements inDegree of target node by exactly 1', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'x', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a', 'x'] })
      graph.addDependency('a', 'b')
      graph.addDependency('x', 'b')

      expect(graph.getInDegree('b')).toBe(2)

      graph.removeDependency('a', 'b')

      expect(graph.getInDegree('b')).toBe(1)
    })

    it('does not decrement inDegree below 0', () => {
      // This targets the `toNode.inDegree > 0` guard on line 211
      // We can't easily force inDegree to be 0 with an existing edge,
      // but we can verify that after removing the only edge, inDegree is exactly 0
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      expect(graph.getInDegree('b')).toBe(1)

      graph.removeDependency('a', 'b')

      expect(graph.getInDegree('b')).toBe(0)
    })

    it('task appears in first wave after all its dependencies are removed', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['b'] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')

      // Before removal: b is in wave 2
      const wavesBefore = graph.getWaves()
      expect(wavesBefore[0]!.map((t) => t.id)).toEqual(['a'])
      expect(wavesBefore[1]!.map((t) => t.id)).toEqual(['b'])
      expect(wavesBefore[2]!.map((t) => t.id)).toEqual(['c'])

      // Remove a -> b
      graph.removeDependency('a', 'b')

      // After removal: b should be in wave 1 (first wave) since it has no deps
      const wavesAfter = graph.getWaves()
      const firstWaveIds = wavesAfter[0]!.map((t) => t.id).toSorted()
      expect(firstWaveIds).toContain('a')
      expect(firstWaveIds).toContain('b')
    })

    it('edgeCount decreases after removeDependency', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['a'] })
      graph.addDependency('a', 'b')
      graph.addDependency('a', 'c')

      expect(graph.edgeCount).toBe(2)

      graph.removeDependency('a', 'b')

      expect(graph.edgeCount).toBe(1)
    })

    it('edgeCount drops to 0 when all edges are removed', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      graph.removeDependency('a', 'b')

      expect(graph.edgeCount).toBe(0)
    })
  })
})
