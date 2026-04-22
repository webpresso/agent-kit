/**
 * Tests for validateTaskDependencies
 */

import { describe, expect, it } from 'vitest'

import { validateTaskDependencies } from './dependencies'

const FRONTMATTER = `---
type: blueprint
status: draft
complexity: S
---

`

describe('validateTaskDependencies', () => {
  describe('valid blueprints', () => {
    it('should pass for blueprint with no tasks', () => {
      const result = validateTaskDependencies(FRONTMATTER + '# Blueprint\n\nNo tasks here.')
      expect(result.valid).toBe(true)
    })

    it('should pass for tasks with None dependencies', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: First task

**Depends:** None

#### Task 1.2: Second task

**Depends:** None
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(true)
    })

    it('should pass for valid linear dependency chain', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: First task

**Depends:** None

#### Task 1.2: Second task

**Depends:** Task 1.1

#### Task 1.3: Third task

**Depends:** Task 1.2
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(true)
    })

    it('should pass for diamond dependency graph', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: Base task

**Depends:** None

#### Task 1.2: Branch A

**Depends:** Task 1.1

#### Task 1.3: Branch B

**Depends:** Task 1.1

#### Task 1.4: Merge task

**Depends:** Task 1.2, Task 1.3
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(true)
    })
  })

  describe('circular dependency detection', () => {
    it('should detect direct A → B → A cycle', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task A

**Depends:** Task 1.2

#### Task 1.2: Task B

**Depends:** Task 1.1
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Circular')
      expect(result.details?.cycles?.length).toBeGreaterThan(0)
    })

    it('should detect longer cycle A → B → C → A', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task A

**Depends:** Task 1.3

#### Task 1.2: Task B

**Depends:** Task 1.1

#### Task 1.3: Task C

**Depends:** Task 1.2
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(false)
      expect(result.details?.cycles?.length).toBeGreaterThan(0)
    })

    it('should detect self-reference', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task A

**Depends:** Task 1.1
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(false)
    })
  })

  describe('dangling reference detection', () => {
    it('should detect reference to non-existent task', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task A

**Depends:** Task 5.1
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Dangling')
      expect(result.details?.danglingRefs?.length).toBeGreaterThan(0)
    })

    it('should not flag None as a dangling reference', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task A

**Depends:** None
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(true)
    })

    it('should show which task has the dangling ref', () => {
      const md =
        FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task A

**Depends:** Task 9.9
`
      const result = validateTaskDependencies(md)
      expect(result.valid).toBe(false)
      expect(result.details?.danglingRefs?.[0]).toContain('Task 1.1')
      expect(result.details?.danglingRefs?.[0]).toContain('Task 9.9')
    })
  })
})
