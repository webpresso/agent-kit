import { describe, expect, it } from 'vitest'

import type { ParsedBlueprintForDb } from '../../db/parser/blueprint-db-parser.js'

import { emitPlan } from './plan.js'

// ---------------------------------------------------------------------------
// Shared test fixture (same shape as spec.test.ts but defined independently)
// ---------------------------------------------------------------------------

const BASE: ParsedBlueprintForDb = {
  slug: 'test-feature',
  filePath: '/tmp/blueprints/planned/test-feature/_overview.md',
  title: 'Test Feature',
  status: 'planned',
  complexity: 'M',
  owner: 'alice',
  created: '2026-01-01',
  lastUpdated: '2026-01-02',
  completedAt: null,
  tags: ['testing'],
  dependsOn: [],
  crossRepoDependsOn: [],
  organization: 'webpresso',
  visibility: 'private',
  byteSize: 100,
  contentHash: 'abc123',
  tasks: [
    {
      taskId: '1.1',
      wave: 'Wave 1',
      title: 'Parse frontmatter',
      status: 'todo',
      description: null,
      acceptanceCriteria: ['All fields extracted'],
      dependsOnTaskIds: [],
      files: [],
    },
    {
      taskId: '2.1',
      wave: 'Wave 2',
      title: 'Write tests',
      status: 'todo',
      description: null,
      acceptanceCriteria: ['All tests pass'],
      dependsOnTaskIds: ['1.1'],
      files: [],
    },
  ],
  risks: [],
  edgeCases: [],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('emitPlan', () => {
  it('starts with the blueprint title and Implementation Plan suffix', () => {
    const output = emitPlan(BASE)
    expect(output).toContain('# Test Feature — Implementation Plan')
  })

  it('includes a reference to spec.md', () => {
    const output = emitPlan(BASE)
    expect(output).toContain('[spec.md](spec.md)')
  })

  it('contains an Architecture section with complexity', () => {
    const output = emitPlan(BASE)
    expect(output).toContain('## Architecture')
    expect(output).toContain('**M**')
  })

  it('contains a Waves section listing tasks', () => {
    const output = emitPlan(BASE)
    expect(output).toContain('## Waves')
    expect(output).toContain('Wave 1')
    expect(output).toContain('Wave 2')
    expect(output).toContain('Parse frontmatter')
    expect(output).toContain('Write tests')
  })

  it('groups tasks under their wave headers', () => {
    const output = emitPlan(BASE)
    const wave1Pos = output.indexOf('Wave 1')
    const wave2Pos = output.indexOf('Wave 2')
    const task1Pos = output.indexOf('Parse frontmatter')
    const task2Pos = output.indexOf('Write tests')
    expect(wave1Pos).toBeLessThan(task1Pos)
    expect(wave2Pos).toBeLessThan(task2Pos)
    expect(task1Pos).toBeLessThan(wave2Pos)
  })

  it('handles blueprint with no tasks', () => {
    const output = emitPlan({ ...BASE, tasks: [] })
    expect(output).toContain('_No tasks defined._')
  })
})
