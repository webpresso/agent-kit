import { describe, expect, it } from 'vitest'

import { TaskGraph } from './task-graph.js'

describe('TaskGraph', () => {
  describe('wave calculation', () => {
    it('calculates avg parallel width as total_tasks / wave_count', () => {
      // Simple linear chain: 4 tasks, 4 waves = 1.0 avg width
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['b'] })
      graph.addTask({ id: 'd', dependencies: ['c'] })

      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')
      graph.addDependency('c', 'd')

      const waves = graph.getWaves()
      const totalTasks = 4
      const avgWidth = totalTasks / waves.length

      expect(waves.length).toBe(4)
      expect(avgWidth).toBe(1.0)
    })

    it('calculates correct waves for fully parallel tasks', () => {
      // All independent: 4 tasks, 1 wave = 4.0 avg width
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addTask({ id: 'c', dependencies: [] })
      graph.addTask({ id: 'd', dependencies: [] })

      const waves = graph.getWaves()
      const totalTasks = 4
      const avgWidth = totalTasks / waves.length

      expect(waves.length).toBe(1)
      expect(avgWidth).toBe(4.0)
    })
  })

  describe('Phase 2.5 draft example validation', () => {
    function buildBeforeOptimizationGraph(): TaskGraph {
      const graph = new TaskGraph()

      graph.addTask({ id: '0.1', dependencies: [] })
      graph.addTask({ id: '0.2', dependencies: ['0.1'] })
      graph.addTask({ id: '0.3', dependencies: ['0.2'] })
      graph.addTask({ id: '0.4', dependencies: ['0.3'] })
      graph.addTask({ id: '0.5', dependencies: ['0.4'] })

      graph.addTask({ id: '1.1', dependencies: [] })
      graph.addTask({ id: '1.2', dependencies: ['1.1'] })
      graph.addTask({ id: '1.3', dependencies: ['1.2'] })
      graph.addTask({ id: '1.4', dependencies: ['1.3'] })

      graph.addTask({ id: '2.1', dependencies: ['1.4'] })
      graph.addTask({ id: '2.2', dependencies: ['2.1'] })

      graph.addTask({ id: '3.1', dependencies: ['1.4'] })
      graph.addTask({ id: '3.2', dependencies: ['3.1'] })

      graph.addTask({ id: '4.1', dependencies: ['2.2', '3.2'] })

      graph.addDependency('0.1', '0.2')
      graph.addDependency('0.2', '0.3')
      graph.addDependency('0.3', '0.4')
      graph.addDependency('0.4', '0.5')
      graph.addDependency('1.1', '1.2')
      graph.addDependency('1.2', '1.3')
      graph.addDependency('1.3', '1.4')
      graph.addDependency('1.4', '2.1')
      graph.addDependency('2.1', '2.2')
      graph.addDependency('1.4', '3.1')
      graph.addDependency('3.1', '3.2')
      graph.addDependency('2.2', '4.1')
      graph.addDependency('3.2', '4.1')

      return graph
    }

    it('BEFORE optimization: matches draft claim of 14 tasks', () => {
      const graph = buildBeforeOptimizationGraph()
      const waves = graph.getWaves()
      const totalTasks = waves.flat().length

      expect(totalTasks).toBe(14)
    })

    it('BEFORE optimization: matches draft claim of 7 waves', () => {
      const graph = buildBeforeOptimizationGraph()
      const waves = graph.getWaves()

      expect(waves.length).toBe(7)
    })

    it('BEFORE optimization: matches draft claim of 2.0 avg parallel width', () => {
      const graph = buildBeforeOptimizationGraph()
      const waves = graph.getWaves()
      const totalTasks = waves.flat().length
      const avgWidth = totalTasks / waves.length

      expect(avgWidth).toBe(2.0)
    })

    function buildAfterOptimizationGraph(): TaskGraph {
      const graph = new TaskGraph()

      graph.addTask({ id: '0.1', dependencies: [] })
      graph.addTask({ id: '0.2', dependencies: ['0.1'] })
      graph.addTask({ id: '0.3', dependencies: ['0.2'] })
      graph.addTask({ id: '0.4', dependencies: ['0.3'] })
      graph.addTask({ id: '0.5', dependencies: ['0.4'] })

      graph.addTask({ id: '1.1', dependencies: [] })
      graph.addTask({ id: '1.2', dependencies: [] })
      graph.addTask({ id: '1.3', dependencies: [] })
      graph.addTask({ id: '1.4', dependencies: ['1.3'] })

      graph.addTask({ id: '2.1', dependencies: ['1.4'] })
      graph.addTask({ id: '2.2', dependencies: ['2.1'] })

      graph.addTask({ id: '3.1', dependencies: ['1.4'] })
      graph.addTask({ id: '3.2', dependencies: ['3.1'] })

      graph.addTask({ id: '4.1', dependencies: ['2.2', '3.2'] })

      graph.addDependency('0.1', '0.2')
      graph.addDependency('0.2', '0.3')
      graph.addDependency('0.3', '0.4')
      graph.addDependency('0.4', '0.5')
      graph.addDependency('1.3', '1.4')
      graph.addDependency('1.4', '2.1')
      graph.addDependency('2.1', '2.2')
      graph.addDependency('1.4', '3.1')
      graph.addDependency('3.1', '3.2')
      graph.addDependency('2.2', '4.1')
      graph.addDependency('3.2', '4.1')

      return graph
    }

    it('AFTER optimization: still has 14 tasks', () => {
      const graph = buildAfterOptimizationGraph()
      const waves = graph.getWaves()
      const totalTasks = waves.flat().length

      expect(totalTasks).toBe(14)
    })

    it('AFTER optimization: wave count matches draft claim', () => {
      const graph = buildAfterOptimizationGraph()
      const waves = graph.getWaves()

      const draftClaimedWaves = 5

      expect(waves.length).toBe(draftClaimedWaves)
    })

    it('AFTER optimization: avg width matches draft claim of 2.8', () => {
      const graph = buildAfterOptimizationGraph()
      const waves = graph.getWaves()
      const totalTasks = waves.flat().length
      const avgWidth = totalTasks / waves.length

      const draftClaimedAvgWidth = 2.8

      expect(avgWidth).toBe(draftClaimedAvgWidth)
    })

    it('CONSISTENCY CHECK: wave count and avg width must be mathematically consistent', () => {
      const graph = buildAfterOptimizationGraph()
      const waves = graph.getWaves()
      const totalTasks = waves.flat().length
      const actualAvgWidth = totalTasks / waves.length

      const derivedTasks = actualAvgWidth * waves.length

      expect(derivedTasks).toBe(totalTasks)

      const draftClaimedWaves = 5
      const draftClaimedAvgWidth = 2.8
      const draftDerivedTasks = draftClaimedAvgWidth * draftClaimedWaves

      expect(draftDerivedTasks).toBe(14)

      expect({
        actualWaves: waves.length,
        actualAvgWidth: actualAvgWidth,
      }).toEqual({
        actualWaves: draftClaimedWaves,
        actualAvgWidth: draftClaimedAvgWidth,
      })
    })
  })

  describe('getAvgParallelWidth helper', () => {
    it('provides clear API for avg parallel width', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addTask({ id: 'c', dependencies: ['a'] })
      graph.addTask({ id: 'd', dependencies: ['b'] })

      graph.addDependency('a', 'c')
      graph.addDependency('b', 'd')

      const waves = graph.getWaves()
      const totalTasks = waves.flat().length
      const avgWidth = totalTasks / waves.length

      expect(waves.length).toBe(2)
      expect(avgWidth).toBe(2.0)
    })
  })

  describe('cycle detection', () => {
    it('hasCycle returns false for acyclic graph', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      expect(graph.hasCycle()).toBe(false)
    })

    it('hasCycle returns true for graph with cycle', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addTask({ id: 'c', dependencies: [] })

      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')
      graph.addDependency('c', 'a')

      expect(graph.hasCycle()).toBe(true)
    })

    it('detectCycles returns null for acyclic graph', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')

      expect(graph.detectCycles()).toBeNull()
    })

    it('detectCycles returns cycle array for cyclic graph', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'a')

      const cycles = graph.detectCycles()
      expect(cycles).not.toBeNull()
      expect(cycles?.length).toBeGreaterThan(0)
    })

    it('hasCycle returns false for empty graph', () => {
      const graph = new TaskGraph()
      expect(graph.hasCycle()).toBe(false)
    })

    it('detectCycles returns null for empty graph', () => {
      const graph = new TaskGraph()
      expect(graph.detectCycles()).toBeNull()
    })
  })

  describe('critical path', () => {
    it('returns longest path through graph', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['b'] })
      graph.addDependency('a', 'b')
      graph.addDependency('b', 'c')

      const criticalPath = graph.getCriticalPath()
      expect(criticalPath.length).toBe(3)
      expect(criticalPath.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    })

    it('handles graph with multiple paths', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['a'] })
      graph.addTask({ id: 'd', dependencies: ['b', 'c'] })
      graph.addDependency('a', 'b')
      graph.addDependency('a', 'c')
      graph.addDependency('b', 'd')
      graph.addDependency('c', 'd')

      const criticalPath = graph.getCriticalPath()
      expect(criticalPath.length).toBe(3)
    })

    it('returns empty for empty graph', () => {
      const graph = new TaskGraph()
      const criticalPath = graph.getCriticalPath()
      expect(criticalPath).toEqual([])
    })
  })

  describe('misc operations', () => {
    it('getMaxParallelWidth returns correct max width', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })
      graph.addTask({ id: 'c', dependencies: [] })

      expect(graph.getMaxParallelWidth()).toBe(3)
    })

    it('ignores duplicate dependency', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addDependency('a', 'b')
      graph.addDependency('a', 'b')

      expect(graph.getInDegree('b')).toBe(1)
    })

    it('throws on self-loop', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      expect(() => graph.addDependency('a', 'a')).toThrow(/self-loop/)
    })

    it('throws on missing source task', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'b', dependencies: [] })

      expect(() => graph.addDependency('missing', 'b')).toThrow(/does not exist/)
    })

    it('throws on missing target task', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      expect(() => graph.addDependency('a', 'missing')).toThrow(/does not exist/)
    })

    it('getOutDegree returns 0 for nonexistent task', () => {
      const graph = new TaskGraph()
      expect(graph.getOutDegree('nonexistent')).toBe(0)
    })

    it('getTask returns undefined for nonexistent task', () => {
      const graph = new TaskGraph()
      expect(graph.getTask('nonexistent')).toBe(undefined)
    })

    it('hasTask returns false for nonexistent task', () => {
      const graph = new TaskGraph()
      expect(graph.hasTask('nonexistent')).toBe(false)
    })

    it('hasTask returns true for existing task', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      expect(graph.hasTask('a')).toBe(true)
    })

    it('getOutDegree returns correct count', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: ['a'] })
      graph.addTask({ id: 'c', dependencies: ['a'] })
      graph.addDependency('a', 'b')
      graph.addDependency('a', 'c')

      expect(graph.getOutDegree('a')).toBe(2)
    })

    it('getTask returns task for existing ID', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })

      const task = graph.getTask('a')
      expect(task).toMatchObject({ id: 'a' })
      expect(task?.id).toBe('a')
    })

    it('getTaskIds returns all task IDs', () => {
      const graph = new TaskGraph()
      graph.addTask({ id: 'a', dependencies: [] })
      graph.addTask({ id: 'b', dependencies: [] })

      const ids = graph.getTaskIds()
      expect(ids).toEqual(expect.arrayContaining(['a', 'b']))
      expect(ids.length).toBe(2)
    })
  })
})
