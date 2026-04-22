import { describe, expect, it } from 'vitest'

import { TaskGraph } from './task-graph.js'

describe('TaskGraph stats and validation', () => {
  describe('getInDegree/getOutDegree for non-existent tasks', () => {
    it('getInDegree returns 0 for a non-existent task ID', () => {
      const graph = new TaskGraph()
      expect(graph.getInDegree('does-not-exist')).toBe(0)
    })

    it('getInDegree returns exact numeric 0 (not undefined or null)', () => {
      const graph = new TaskGraph()
      const result = graph.getInDegree('phantom')
      expect(result).toBe(0)
      expect(typeof result).toBe('number')
    })

    it('getOutDegree returns 0 for a non-existent task ID', () => {
      const graph = new TaskGraph()
      const result = graph.getOutDegree('phantom')
      expect(result).toBe(0)
      expect(typeof result).toBe('number')
    })
  })

  describe('getStats detailed assertions', () => {
    it('stats.isolatedNodes lists tasks with no edges in multi-node graph', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addTask({ id: 'c', dependencies: [] })
      graph.addTask({ id: 'd', dependencies: ['a'] })
      graph.addDependency('a', 'd')

      const stats = graph.getStats()

      expect(stats.isolatedNodes).toContain('b')
      expect(stats.isolatedNodes).toContain('c')
      expect(stats.isolatedNodes).not.toContain('a')
      expect(stats.isolatedNodes).not.toContain('d')
      expect(stats.isolatedNodes.length).toBe(2)
    })

    it('stats.isolatedNodes is empty for a single-node graph', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'only', dependencies: [] })

      const stats = graph.getStats()

      expect(stats.isolatedNodes).toEqual([])
    })

    it('stats throws on cyclic graph because getCriticalPath requires acyclic', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'a')

      // getStats calls getCriticalPath which calls getTopologicalOrder which throws on cycles
      expect(() => graph.getStats()).toThrow('Circular dependency detected')
      // Use hasCycle() directly to check for cycles
      expect(graph.hasCycle()).toBe(true)
    })

    it('stats.hasCycles is false when graph is acyclic', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      const stats = graph.getStats()

      expect(stats.hasCycles).toBe(false)
    })

    it('stats.waveCount equals number of waves from getWaves', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['b'] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')

      const stats = graph.getStats()

      expect(stats.waveCount).toBe(3)
    })

    it('stats.maxDepth equals critical path length', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['b'] })
      graph.addTask({ id: 'd', dependencies: [] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')

      const stats = graph.getStats()

      // Critical path is a -> b -> c (length 3)
      expect(stats.maxDepth).toBe(3)
    })

    it('stats.maxWidth equals the widest wave', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['a'] })
      graph.addTask({ id: 'd', dependencies: ['a'] })
      graph.addDependency('a', 'b')
      graph.addDependency('a', 'c')
      graph.addDependency('a', 'd')

      const stats = graph.getStats()

      expect(stats.maxWidth).toBe(3)
    })
  })

  describe('validate detailed assertions', () => {
    it('validate returns valid=true and no errors/warnings for a well-formed graph', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      const result = graph.validate()

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
      expect(result.warnings).toEqual([])
    })

    it('validate returns specific cycle error message', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'x', dependencies: [] })
      graph.addTask({ id: 'y', dependencies: [] })
      graph.addDependency('x', 'y')
      graph.addDependency('y', 'x')

      const result = graph.validate()

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('Circular dependency')
    })

    it('validate returns specific isolated node warning message', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'connected1', dependencies: [] })
      graph.addTask({ id: 'connected2', dependencies: ['connected1'] })
      graph.addTask({ id: 'isolated', dependencies: [] })
      graph.addDependency('connected1', 'connected2')

      const result = graph.validate()

      expect(result.valid).toBe(true)
      const isolatedWarning = result.warnings.find((w) => w.includes('isolated'))
      expect(typeof isolatedWarning).toBe('string')
      expect(isolatedWarning).toContain('isolated')
      expect(isolatedWarning).toContain('"isolated"')
    })

    it('validate does not warn about isolated nodes when only 1 task exists', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'solo', dependencies: [] })

      const result = graph.validate()

      expect(result.valid).toBe(true)
      expect(result.warnings).toEqual([])
    })

    it('validate returns specific unwired dependency warning message', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'dep', dependencies: [] })
      graph.addTask({ id: 'task', dependencies: ['dep'] })
      // Note: NOT calling addDependency - so the dep is declared but not wired

      const result = graph.validate()

      const unwiredWarning = result.warnings.find((w) => w.includes('not wired'))
      expect(typeof unwiredWarning).toBe('string')
      expect(unwiredWarning).toContain('"task"')
      expect(unwiredWarning).toContain('"dep"')
    })
  })

  describe('subgraph', () => {
    it('creates subgraph with specified tasks', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: [] })
      graph.addDependency('a', 'b')

      const sub = graph.subgraph(['a', 'b'])

      expect(sub.hasTask('a')).toBe(true)
      expect(sub.hasTask('b')).toBe(true)
      expect(sub.hasTask('c')).toBe(false)
    })

    it('copies edges between subgraph tasks', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['b'] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')

      const sub = graph.subgraph(['a', 'b'])

      expect(sub.getInDegree('b')).toBe(1)
      expect(sub.getOutDegree('a')).toBe(1)
    })

    it('handles nonexistent tasks in subgraph request', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      const sub = graph.subgraph(['a', 'nonexistent'])

      expect(sub.hasTask('a')).toBe(true)
      expect(sub.hasTask('nonexistent')).toBe(false)
    })
  })
})
