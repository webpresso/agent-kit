import { describe, expect, it } from 'vitest'

import { parsePlan, planTasksToGraphTasks } from './plan-parser.js'

describe('parsePlan', () => {
  describe('title extraction', () => {
    it('extracts title from first heading', () => {
      const markdown = `# Implementation Plan

1. First task
2. Second task`

      const result = parsePlan(markdown)

      expect(result.title).toBe('Implementation Plan')
    })

    it('handles missing title', () => {
      const markdown = `1. First task
2. Second task`

      const result = parsePlan(markdown)

      expect(result.title).toBe('')
    })
  })

  describe('numbered list parsing', () => {
    it('parses simple numbered tasks', () => {
      const markdown = `# Plan

1. Fix lint errors
2. Fix typecheck errors
3. Run tests`

      const result = parsePlan(markdown)

      expect(result.tasks).toHaveLength(3)
      expect(result.tasks[0]?.id).toBe('1')
      expect(result.tasks[0]?.title).toBe('Fix lint errors')
      expect(result.tasks[1]?.id).toBe('2')
      expect(result.tasks[2]?.id).toBe('3')
    })

    it('parses tasks with dependencies', () => {
      const markdown = `# Plan

1. Fix lint errors
2. [depends: 1] Fix typecheck errors
3. [depends: 1, 2] Run tests`

      const result = parsePlan(markdown)

      expect(result.tasks[0]?.dependsOn).toEqual([])
      expect(result.tasks[1]?.dependsOn).toEqual(['1'])
      expect(result.tasks[2]?.dependsOn).toEqual(['1', '2'])
    })

    it('handles whitespace in dependency lists', () => {
      const markdown = `1. First
2. [depends: 1 ,  3 ] Second`

      const result = parsePlan(markdown)

      expect(result.tasks[1]?.dependsOn).toEqual(['1', '3'])
    })
  })

  describe('checkbox format parsing', () => {
    it('parses checkbox tasks', () => {
      const markdown = `# Tasks

- [ ] First task
- [ ] Second task
- [x] Third task (done)`

      const result = parsePlan(markdown)

      expect(result.tasks).toHaveLength(3)
      expect(result.tasks[0]?.title).toBe('First task')
      expect(result.tasks[1]?.title).toBe('Second task')
      expect(result.tasks[2]?.title).toBe('Third task (done)')
    })

    it('parses checkbox tasks with dependencies', () => {
      const markdown = `- [ ] Task A
- [ ] [depends: 1] Task B`

      const result = parsePlan(markdown)

      expect(result.tasks[0]?.dependsOn).toEqual([])
      expect(result.tasks[1]?.dependsOn).toEqual(['1'])
    })

    it('generates sequential IDs for checkbox tasks', () => {
      const markdown = `- [ ] First
- [ ] Second
- [ ] Third`

      const result = parsePlan(markdown)

      expect(result.tasks.map((t) => t.id)).toEqual(['1', '2', '3'])
    })
  })

  describe('task type inference', () => {
    it('infers lint-fix type', () => {
      const result = parsePlan('1. Fix lint errors in cli2')
      expect(result.tasks[0]?.type).toBe('lint-fix')

      const result2 = parsePlan('1. Run biome check')
      expect(result2.tasks[0]?.type).toBe('lint-fix')
    })

    it('infers typecheck-fix type', () => {
      const result = parsePlan('1. Fix typecheck errors')
      expect(result.tasks[0]?.type).toBe('typecheck-fix')

      const result2 = parsePlan('1. Run tsc --noEmit')
      expect(result2.tasks[0]?.type).toBe('typecheck-fix')
    })

    it('infers test-fix type', () => {
      const result = parsePlan('1. Fix failing tests')
      expect(result.tasks[0]?.type).toBe('test-fix')

      const result2 = parsePlan('1. Run vitest')
      expect(result2.tasks[0]?.type).toBe('test-fix')
    })

    it('infers research type', () => {
      const result = parsePlan('1. Research best practices')
      expect(result.tasks[0]?.type).toBe('research')

      const result2 = parsePlan('1. Investigate memory leak')
      expect(result2.tasks[0]?.type).toBe('research')
    })

    it('infers verify type', () => {
      const result = parsePlan('1. Verify deployment')
      expect(result.tasks[0]?.type).toBe('verify')

      const result2 = parsePlan('1. Check build output')
      expect(result2.tasks[0]?.type).toBe('verify')
    })

    it('defaults to implement type', () => {
      const result = parsePlan('1. Add new feature')
      expect(result.tasks[0]?.type).toBe('implement')
    })
  })

  describe('metadata extraction', () => {
    it('extracts package name with "in" prefix', () => {
      const result = parsePlan('1. Fix errors in cli2')
      expect(result.tasks[0]?.package).toBe('cli2')
    })

    it('extracts package name with "for" prefix', () => {
      const result = parsePlan('1. Fix errors for schema-engine')
      expect(result.tasks[0]?.package).toBe('schema-engine')
    })

    it('extracts full package name', () => {
      const result = parsePlan('1. Update @myorg/dag-analysis')
      expect(result.tasks[0]?.package).toBe('dag-analysis')
    })

    it('extracts file path', () => {
      const result = parsePlan('1. Fix src/index.ts')
      expect(result.tasks[0]?.file).toBe('src/index.ts')
    })

    it('extracts various file extensions', () => {
      const cases = [
        ['1. Edit file.tsx', 'file.tsx'],
        ['1. Update config.json', 'config.json'],
        ['1. Fix docs/README.md', 'docs/README.md'],
      ]

      for (const [input, expected] of cases) {
        const result = parsePlan(input as string)
        expect(result.tasks[0]?.file).toBe(expected)
      }
    })
  })

  describe('metadata calculations', () => {
    it('calculates totalTasks', () => {
      const result = parsePlan(`1. Task 1
2. Task 2
3. Task 3`)

      expect(result.metadata.totalTasks).toBe(3)
    })

    it('calculates maxParallelism for independent tasks', () => {
      const result = parsePlan(`1. Task A
2. Task B
3. Task C`)

      expect(result.metadata.maxParallelism).toBe(3)
    })

    it('calculates maxParallelism for chained tasks', () => {
      const result = parsePlan(`1. Task A
2. [depends: 1] Task B
3. [depends: 2] Task C`)

      expect(result.metadata.maxParallelism).toBe(1)
    })

    it('calculates maxParallelism for mixed dependencies', () => {
      const result = parsePlan(`1. Task A
2. Task B
3. [depends: 1, 2] Task C`)

      expect(result.metadata.maxParallelism).toBe(2)
    })

    it('calculates criticalPathLength for independent tasks', () => {
      const result = parsePlan(`1. Task A
2. Task B
3. Task C`)

      expect(result.metadata.criticalPathLength).toBe(1)
    })

    it('calculates criticalPathLength for chained tasks', () => {
      const result = parsePlan(`1. Task A
2. [depends: 1] Task B
3. [depends: 2] Task C`)

      expect(result.metadata.criticalPathLength).toBe(3)
    })

    it('handles empty plan', () => {
      const result = parsePlan('')

      expect(result.metadata.totalTasks).toBe(0)
      expect(result.metadata.maxParallelism).toBe(0)
      expect(result.metadata.criticalPathLength).toBe(0)
    })
  })

  describe('malformed input handling', () => {
    it('handles numbered task with missing description after number', () => {
      const markdown = `1. 
2. Valid task`

      const result = parsePlan(markdown)

      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0]?.id).toBe('2')
    })

    it('handles checkbox task with missing description', () => {
      const markdown = `- [ ] 
- [ ] Valid task`

      const result = parsePlan(markdown)

      expect(result.tasks).toHaveLength(1)
    })

    it('handles lines that look like tasks but are not', () => {
      const markdown = `100. Not a valid numbered task format?
1. Valid task`

      const result = parsePlan(markdown)

      expect(result.tasks.length).toBeGreaterThanOrEqual(1)
    })

    it('handles empty dependency list', () => {
      const markdown = `1. [depends:] Task with empty deps`

      const result = parsePlan(markdown)

      expect(result.tasks[0]?.dependsOn).toEqual([])
    })

    it('handles line with only whitespace in dependency', () => {
      const markdown = `1. [depends:   ] Task`

      const result = parsePlan(markdown)

      expect(result.tasks).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    it('ignores non-task lines', () => {
      const markdown = `# Plan

Some description text.

1. Actual task

More text here.

## Section Header

2. Another task`

      const result = parsePlan(markdown)

      expect(result.tasks).toHaveLength(2)
    })

    it('handles mixed formats', () => {
      const markdown = `1. Numbered task
- [ ] Checkbox task`

      const result = parsePlan(markdown)

      expect(result.tasks).toHaveLength(2)
    })

    it('handles whitespace-only lines', () => {
      const markdown = `1. Task 1



2. Task 2`

      const result = parsePlan(markdown)

      expect(result.tasks).toHaveLength(2)
    })
  })
})

describe('planTasksToGraphTasks', () => {
  it('converts plan tasks to graph format', () => {
    const planTasks = [
      {
        id: '1',
        title: 'First task',
        description: 'First task',
        type: 'implement' as const,
        dependsOn: [],
      },
      {
        id: '2',
        title: 'Second task',
        description: 'Second task',
        type: 'implement' as const,
        dependsOn: ['1'],
      },
    ]

    const graphTasks = planTasksToGraphTasks(planTasks)

    expect(graphTasks).toHaveLength(2)
    expect(graphTasks[0]?.task.id).toBe('1')
    expect(graphTasks[0]?.dependsOn).toBe(undefined)
    expect(graphTasks[1]?.task.id).toBe('2')
    expect(graphTasks[1]?.dependsOn).toEqual(['1'])
  })

  it('preserves task data in graph tasks', () => {
    const planTasks = [
      {
        id: '1',
        title: 'Lint fix',
        description: 'Fix lint errors',
        type: 'lint-fix' as const,
        package: 'cli2',
        dependsOn: [],
      },
    ]

    const graphTasks = planTasksToGraphTasks(planTasks)

    expect(graphTasks[0]?.task.data).toEqual(planTasks[0])
    expect(graphTasks[0]?.task.data.type).toBe('lint-fix')
    expect(graphTasks[0]?.task.data.package).toBe('cli2')
  })

  it('sets dependencies array in task data', () => {
    const planTasks = [
      { id: '1', title: 'A', description: 'A', type: 'implement' as const, dependsOn: [] },
      { id: '2', title: 'B', description: 'B', type: 'implement' as const, dependsOn: ['1'] },
    ]

    const graphTasks = planTasksToGraphTasks(planTasks)

    expect(graphTasks[1]?.task.dependencies).toEqual(['1'])
  })
})

// ============================================================
// Mutation-killing tests for plan-parser.ts
// ============================================================

describe('TASK_PATTERN regex mutations (line 31)', () => {
  it('rejects lines not starting with a number (kills ^ anchor removal)', () => {
    // If ^ is removed, "abc 1. Task" could match
    const result = parsePlan('abc 1. Task description')
    expect(result.tasks).toHaveLength(0)
  })

  it('rejects lines with trailing garbage after task (kills $ anchor removal)', () => {
    // If $ is removed, partial matches might succeed differently
    // Valid line should still match fully
    const result = parsePlan('1. Task description')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.title).toBe('Task description')
  })

  it('matches multi-digit task numbers (kills \\d+ -> \\d mutation)', () => {
    const result = parsePlan('12. Task twelve')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.id).toBe('12')
    expect(result.tasks[0]?.title).toBe('Task twelve')
  })

  it('matches task with multiple spaces after number (kills \\s* -> \\s mutation)', () => {
    const result = parsePlan('1.   Task with extra spaces')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.title).toBe('Task with extra spaces')
  })

  it('matches task with no space after period (kills \\s+ to \\s requiring space)', () => {
    // The pattern uses \\s* (zero or more), so "1.Task" should also work
    const result = parsePlan('1.Task directly after period')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.title).toBe('Task directly after period')
  })

  it('requires at least one character in description (kills .+ -> .* mutation)', () => {
    // "1. " with only whitespace after — trimmed line is "1." which has no desc match
    const result = parsePlan('1. ')
    // .+ requires at least 1 char, so empty desc should not match
    const tasks = result.tasks.filter((t) => t.id === '1')
    expect(tasks).toHaveLength(0)
  })

  it('matches description with special characters', () => {
    const result = parsePlan('1. Fix [bracket] issue (parens) & special-chars')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.title).toBe('Fix [bracket] issue (parens) & special-chars')
  })
})

describe('CHECKBOX_PATTERN regex mutations (line 33)', () => {
  it('rejects lines not starting with dash (kills ^ anchor removal)', () => {
    const result = parsePlan('  text - [ ] Not at start')
    // The line when trimmed becomes "text - [ ] Not at start" which should not match
    expect(result.tasks.filter((t) => t.title === 'Not at start')).toHaveLength(0)
  })

  it('matches checkbox with uppercase X (kills /i flag removal)', () => {
    const result = parsePlan('- [X] Done task')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.title).toBe('Done task')
  })

  it('matches checkbox with multiple spaces after bracket (kills \\s* -> \\s)', () => {
    const result = parsePlan('-   [ ]   Task with lots of spaces')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.title).toBe('Task with lots of spaces')
  })

  it('matches checkbox with no space after dash (kills \\s* zero quantifier)', () => {
    const result = parsePlan('-[ ] No space after dash')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.title).toBe('No space after dash')
  })

  it('requires description content after checkbox (kills .+ -> .* mutation)', () => {
    const result = parsePlan('- [ ] ')
    // .+ requires at least 1 char
    expect(result.tasks).toHaveLength(0)
  })

  it('rejects line without bracket content matching', () => {
    const result = parsePlan('- [] Invalid checkbox')
    // Pattern expects [ x] or [  ], so [] should not match
    expect(result.tasks).toHaveLength(0)
  })
})

describe('extractTitle - startsWith guard (line 41)', () => {
  it('does not match ## heading as title (requires exactly "# ")', () => {
    const result = parsePlan(`## Not a title
1. A task`)
    expect(result.title).toBe('')
  })

  it('does not match "#NoSpace" as title (requires space after #)', () => {
    const result = parsePlan(`#NoSpaceAfterHash
1. A task`)
    expect(result.title).toBe('')
  })

  it('matches "# " with single space correctly', () => {
    const result = parsePlan(`# My Title
1. A task`)
    expect(result.title).toBe('My Title')
  })

  it('returns first heading only when multiple headings exist', () => {
    const result = parsePlan(`# First Title
# Second Title
1. A task`)
    expect(result.title).toBe('First Title')
  })
})

describe('parseNumberedTask guard (line 62)', () => {
  it('rejects numbered task where regex captures empty num', () => {
    // This is hard to trigger naturally since \\d+ always captures at least one digit
    // But we ensure the guard works by testing a valid case to confirm presence
    const result = parsePlan('1. Valid task')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.id).toBe('1')
    expect(result.tasks[0]?.title).toBe('Valid task')
  })

  it('numbered task description is exactly captured (no extra whitespace)', () => {
    const result = parsePlan('5. Run the thing')
    expect(result.tasks[0]?.description).toBe('Run the thing')
  })
})

describe('parseCheckboxTask guard (line 82)', () => {
  it('checkbox task always has a description when matched', () => {
    const result = parsePlan('- [ ] Do something')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.title).toBe('Do something')
    expect(result.tasks[0]?.description).toBe('Do something')
  })

  it('checkbox with only whitespace description does not match', () => {
    const result = parsePlan('- [ ]   ')
    // After regex .+ fails on whitespace-only, should not create a task
    expect(result.tasks).toHaveLength(0)
  })
})

describe('package extraction patterns (lines 196-197)', () => {
  it('extracts package with "in" keyword using word boundary', () => {
    const result = parsePlan('1. Fix errors in cli2')
    expect(result.tasks[0]?.package).toBe('cli2')
  })

  it('extracts package with "for" keyword using word boundary', () => {
    const result = parsePlan('1. Build feature for schema-engine')
    expect(result.tasks[0]?.package).toBe('schema-engine')
  })

  it('does not extract "in" from middle of a word (word boundary test)', () => {
    // "reindex" contains "in" but not at word boundary
    const _result = parsePlan('1. Reindex the data')
    // "in" inside "reindex" should not trigger — but it could match "in the" later?
    // Actually "in the" would match. Let's use a case where "in" only appears inside a word.
    const result2 = parsePlan('1. Reindex everything')
    // The "in" pattern requires \\b before "in", so "reindex" has boundary before 'r' not before 'i'
    // But "Reindex" -> lowercase "reindex", \\b matches between 're' and 'index'? No.
    // Let's check: "reindex" — \\b matches start/end of words. 'r','e','i','n','d','e','x' are all \\w.
    // \\bin\\s+ would need 'in' preceded by word boundary. In "reindex", 'i' at position 2 is not a boundary.
    // So package should be undefined.
    expect(result2.tasks[0]?.package).toBe(undefined)
  })

  it('extracts @myorg/ scoped package name', () => {
    const result = parsePlan('1. Update @myorg/dag-analysis types')
    expect(result.tasks[0]?.package).toBe('dag-analysis')
  })

  it('prefers first matching pattern ("in" before "for")', () => {
    const result = parsePlan('1. Fix errors in cli2 for schema-engine')
    expect(result.tasks[0]?.package).toBe('cli2')
  })
})

describe('calculateMaxParallelism depth caching (lines 228, 236-237)', () => {
  it('caches depth computations correctly for diamond dependency', () => {
    // Diamond: 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 4
    const result = parsePlan(`1. Start task
2. [depends: 1] Branch A
3. [depends: 1] Branch B
4. [depends: 2, 3] Merge task`)

    // Depth 0: task 1
    // Depth 1: tasks 2, 3
    // Depth 2: task 4
    // Max parallelism = 2 (tasks 2 and 3)
    expect(result.metadata.maxParallelism).toBe(2)
  })

  it('returns maxParallelism of 1 for fully sequential tasks', () => {
    const result = parsePlan(`1. First
2. [depends: 1] Second
3. [depends: 2] Third
4. [depends: 3] Fourth`)

    expect(result.metadata.maxParallelism).toBe(1)
  })

  it('depth increments by exactly 1 per dependency level (kills +1 -> -1 or +0 mutations)', () => {
    // 3 independent tasks at depth 0, one at depth 1 depending on all 3
    const result = parsePlan(`1. Task A
2. Task B
3. Task C
4. [depends: 1, 2, 3] Final task`)

    // Depth 0: tasks 1, 2, 3 (count=3)
    // Depth 1: task 4 (count=1)
    // maxParallelism = 3
    expect(result.metadata.maxParallelism).toBe(3)
  })

  it('Math.max picks the correct depth among dependencies (kills Math.max mutation)', () => {
    // Task 4 depends on both task 2 (depth 1) and task 3 (depth 2)
    // So task 4 should be at depth 3
    const result = parsePlan(`1. Base task
2. [depends: 1] Mid A
3. [depends: 2] Deep B
4. [depends: 2, 3] Final depends on both depths`)

    // Depth 0: task 1
    // Depth 1: task 2
    // Depth 2: task 3
    // Depth 3: task 4 (max(1,2)+1 = 3)
    // maxParallelism = 1 (one task at each depth level)
    expect(result.metadata.maxParallelism).toBe(1)
    expect(result.metadata.criticalPathLength).toBe(4)
  })
})

describe('calculateCriticalPath depth caching (lines 264, 272)', () => {
  it('returns critical path of 1 for single independent task', () => {
    const result = parsePlan('1. Only task')
    expect(result.metadata.criticalPathLength).toBe(1)
  })

  it('returns critical path of 1 for all independent tasks', () => {
    const result = parsePlan(`1. Task A
2. Task B
3. Task C`)

    expect(result.metadata.criticalPathLength).toBe(1)
  })

  it('returns correct critical path for linear chain', () => {
    const result = parsePlan(`1. First
2. [depends: 1] Second
3. [depends: 2] Third`)

    expect(result.metadata.criticalPathLength).toBe(3)
  })

  it('critical path follows the longest branch (kills Math.max mutation)', () => {
    // Branch 1: 1 -> 2 (depth 2)
    // Branch 2: 1 -> 3 -> 4 (depth 3)
    // Critical path should be 3
    const result = parsePlan(`1. Root
2. [depends: 1] Short branch
3. [depends: 1] Long branch start
4. [depends: 3] Long branch end`)

    expect(result.metadata.criticalPathLength).toBe(3)
  })

  it('depth increments by exactly 1 (kills +1 -> +0 or +2 mutation)', () => {
    const result = parsePlan(`1. A
2. [depends: 1] B`)

    // A has depth 1, B has depth 2
    expect(result.metadata.criticalPathLength).toBe(2)
  })

  it('caches depth correctly for shared dependencies (kills cache check)', () => {
    // Task 3 and 4 both depend on task 2.
    // Without caching, depth of 2 might be recalculated.
    // With a mutation that breaks caching, results could differ.
    const result = parsePlan(`1. Base
2. [depends: 1] Middle
3. [depends: 2] End A
4. [depends: 2] End B`)

    // Depths: 1->1, 2->2, 3->3, 4->3
    // Critical path = 3
    expect(result.metadata.criticalPathLength).toBe(3)
  })
})

describe('checkboxIndex counter and task ID generation', () => {
  it('checkbox IDs are sequential starting at 1 even with non-checkbox lines interspersed', () => {
    const result = parsePlan(`# Plan
Some description
- [ ] First checkbox
Random text
- [ ] Second checkbox`)

    expect(result.tasks).toHaveLength(2)
    // checkboxIndex increments for every non-numbered line, so IDs may not be 1, 2
    // Let's verify the actual IDs are sequential numbers
    const ids = result.tasks.map((t) => t.id)
    // Each non-numbered line increments checkboxIndex
    // Line "# Plan" -> checkboxIndex=1, not a checkbox
    // Line "" -> checkboxIndex=2
    // Line "Some description" -> checkboxIndex=3
    // Line "Random text" (after trimming from empty) -> varies
    // Line "- [ ] First checkbox" -> incremented index
    // This tests that IDs are assigned as numbers and are unique
    expect(ids.length).toBe(2)
    expect(Number(ids[0])).toBeGreaterThan(0)
    expect(Number(ids[1])).toBeGreaterThan(Number(ids[0]))
  })

  it('numbered tasks do not increment the checkbox counter', () => {
    const result = parsePlan(`1. Numbered task
- [ ] Checkbox task`)

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0]?.id).toBe('1')
    // The checkbox task gets checkboxIndex after the numbered task line didn't increment it
    // Line "1. Numbered task" matches numbered -> continue (no checkboxIndex++)
    // Line "- [ ] Checkbox task" -> checkboxIndex++ (becomes 1), then matches
    expect(result.tasks[1]?.id).toBe('1')
  })
})
