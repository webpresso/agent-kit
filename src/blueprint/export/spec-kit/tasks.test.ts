import { describe, expect, it } from 'vitest'

import type { ParsedBlueprintForDb } from '../../db/parser/blueprint-db-parser.js'

import { emitTasks } from './tasks.js'

// ---------------------------------------------------------------------------
// Shared test fixture
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
      acceptanceCriteria: ['All fields extracted from YAML'],
      dependsOnTaskIds: [],
      files: [{ filePath: 'src/parser.ts', op: 'modify' }],
    },
    {
      taskId: '1.2',
      wave: 'Wave 1',
      title: 'Validate schema',
      status: 'todo',
      description: null,
      acceptanceCriteria: ['Schema errors are reported'],
      dependsOnTaskIds: [],
      files: [],
    },
    {
      taskId: '2.1',
      wave: 'Wave 2',
      title: 'Write integration tests',
      status: 'todo',
      description: null,
      acceptanceCriteria: [],
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

describe('emitTasks', () => {
  it('uses - [ ] checkbox format for each task', () => {
    const output = emitTasks(BASE)
    const checkboxCount = (output.match(/^- \[ \]/gm) ?? []).length
    expect(checkboxCount).toBe(3)
  })

  it('adds [P] marker when a wave has multiple tasks', () => {
    const output = emitTasks(BASE)
    // Wave 1 has 2 tasks → both get [P]
    const parallelMatches = output.match(/\[P\]/g) ?? []
    expect(parallelMatches.length).toBe(2)
  })

  it('does NOT add [P] marker for single-task waves', () => {
    const output = emitTasks(BASE)
    // Wave 2 has 1 task — find the Write tests line
    const lines = output.split('\n')
    const wave2TaskLine = lines.find((l) => l.includes('Write integration tests'))
    expect(wave2TaskLine).toBeDefined()
    expect(wave2TaskLine).not.toContain('[P]')
  })

  it('includes T001, T002, T003 labels in order', () => {
    const output = emitTasks(BASE)
    expect(output).toContain('T001')
    expect(output).toContain('T002')
    expect(output).toContain('T003')
    // T001 before T002 before T003
    expect(output.indexOf('T001')).toBeLessThan(output.indexOf('T002'))
    expect(output.indexOf('T002')).toBeLessThan(output.indexOf('T003'))
  })

  it('includes acceptance criteria when present', () => {
    const output = emitTasks(BASE)
    expect(output).toContain('Acceptance:')
    expect(output).toContain('All fields extracted from YAML')
  })

  it('includes file paths when present', () => {
    const output = emitTasks(BASE)
    expect(output).toContain('Files: src/parser.ts')
  })

  it('handles blueprint with no tasks', () => {
    const output = emitTasks({ ...BASE, tasks: [] })
    expect(output).toContain('_No tasks defined._')
    expect(output).not.toContain('T001')
  })
})
