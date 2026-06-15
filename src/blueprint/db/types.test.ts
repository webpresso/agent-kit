import { describe, expect, it } from 'vitest'

import { BpRowSchema, TaskRowCompactSchema, TaskRowSchema } from './types.js'

const validTaskRow = {
  id: 1,
  blueprint_slug: '2026-06-14-type-safe-sqlite-and-json-parsing',
  task_id: '1.1',
  wave: '0',
  lane: 'backend',
  title: 'Create shared DB row types with Zod schemas',
  status: 'todo',
  extra_column: 'preserved',
} as const

const validCompactTaskRow = {
  task_id: '1.1',
  wave: null,
  lane: null,
  title: 'Create shared DB row types with Zod schemas',
  status: 'in-progress',
  extra_column: 'preserved',
} as const

const validBpRow = {
  slug: '2026-06-14-type-safe-sqlite-and-json-parsing',
  title: 'Type-safe SQLite and JSON parsing',
  status: 'planned',
  complexity: 'L',
  owner: 'ozby',
  last_updated: '2026-06-14',
  content_hash: 'abc123',
  ingested_at: 1_718_323_200_000,
  file_path: '/repo/blueprints/planned/2026-06-14-type-safe-sqlite-and-json-parsing.md',
  project_id: 'current-project',
} as const

describe('TaskRowSchema', () => {
  it('parses valid task rows and keeps extra SQLite columns', () => {
    expect(TaskRowSchema.parse(validTaskRow)).toEqual(validTaskRow)
  })

  it('throws when a required task column is missing', () => {
    const { task_id: _taskId, ...missingTaskId } = validTaskRow

    expect(() => TaskRowSchema.parse(missingTaskId)).toThrow()
  })

  it('throws when a task column has the wrong type', () => {
    expect(() => TaskRowSchema.parse({ ...validTaskRow, id: '1' })).toThrow()
  })
})

describe('TaskRowCompactSchema', () => {
  it('parses valid compact task rows and keeps extra SQLite columns', () => {
    expect(TaskRowCompactSchema.parse(validCompactTaskRow)).toEqual(validCompactTaskRow)
  })

  it('throws when a required compact task column is missing', () => {
    const { status: _status, ...missingStatus } = validCompactTaskRow

    expect(() => TaskRowCompactSchema.parse(missingStatus)).toThrow()
  })

  it('throws when a compact task column has the wrong type', () => {
    expect(() => TaskRowCompactSchema.parse({ ...validCompactTaskRow, lane: 123 })).toThrow()
  })
})

describe('BpRowSchema', () => {
  it('parses valid blueprint rows and keeps extra SQLite columns', () => {
    expect(BpRowSchema.parse(validBpRow)).toEqual(validBpRow)
  })

  it('throws when a required blueprint column is missing', () => {
    const { content_hash: _contentHash, ...missingContentHash } = validBpRow

    expect(() => BpRowSchema.parse(missingContentHash)).toThrow()
  })

  it('throws when a blueprint column has the wrong type', () => {
    expect(() => BpRowSchema.parse({ ...validBpRow, ingested_at: '1718323200000' })).toThrow()
  })
})
