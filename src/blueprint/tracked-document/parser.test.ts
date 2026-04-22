/**
 * Tracked Document Parser Tests
 *
 * Tests for pure parsing functions used across Blueprint and TechDebt parsers.
 */

import { describe, expect, it } from 'vitest'

import {
  extractAcceptanceCriteria,
  extractBlocked,
  extractCheckboxStatus,
  extractDepends,
  extractTaskDescription,
  findTaskSectionEnd,
} from './parser.js'

describe('extractCheckboxStatus', () => {
  it('returns todo status with 0 checkboxes', () => {
    const section = '#### Task 1.1: Setup\nSome description'
    const result = extractCheckboxStatus(section)
    expect(result).toEqual({ total: 0, checked: 0, status: 'todo' })
  })

  it('returns todo status with all unchecked', () => {
    const section = `
#### Task 1.1: Setup
- [ ] First item
- [ ] Second item
`
    const result = extractCheckboxStatus(section)
    expect(result).toEqual({ total: 2, checked: 0, status: 'todo' })
  })

  it('returns in_progress status with some checked', () => {
    const section = `
#### Task 1.1: Setup
- [x] First item
- [ ] Second item
- [ ] Third item
`
    const result = extractCheckboxStatus(section)
    expect(result).toEqual({ total: 3, checked: 1, status: 'in_progress' })
  })

  it('returns done status with all checked', () => {
    const section = `
#### Task 1.1: Setup
- [x] First item
- [x] Second item
`
    const result = extractCheckboxStatus(section)
    expect(result).toEqual({ total: 2, checked: 2, status: 'done' })
  })

  it('only counts checkboxes at start of line', () => {
    const section = `
#### Task 1.1: Setup
- [x] First item
  - [ ] Nested (should not count)
- [ ] Second item
`
    const result = extractCheckboxStatus(section)
    expect(result).toEqual({ total: 2, checked: 1, status: 'in_progress' })
  })

  it('handles lane-prefixed task headers', () => {
    const section = `
#### [backend] Task 1.1: Setup
- [x] First item
- [ ] Second item
`
    const result = extractCheckboxStatus(section)
    expect(result).toEqual({ total: 2, checked: 1, status: 'in_progress' })
  })
})

describe('extractAcceptanceCriteria', () => {
  it('returns checkbox counts without status', () => {
    const section = `
#### Task 1.1: Setup
- [x] First item
- [ ] Second item
`
    const result = extractAcceptanceCriteria(section)
    expect(result).toEqual({ total: 2, checked: 1 })
  })
})

describe('extractDepends', () => {
  it('extracts explicit "Task X.Y" format', () => {
    const section = '**Depends:** Task 1.1, Task 1.2'
    expect(extractDepends(section)).toEqual(['1.1', '1.2'])
  })

  it('extracts plural "Tasks X.Y" format with bare IDs', () => {
    const section = '**Depends:** Tasks 1.1, 1.2, 1.3'
    expect(extractDepends(section)).toEqual(['1.1', '1.2', '1.3'])
  })

  it('extracts bare task IDs', () => {
    const section = '**Depends:** 1.1, 2.3'
    expect(extractDepends(section)).toEqual(['1.1', '2.3'])
  })

  it('returns empty array for "None"', () => {
    const section = '**Depends:** None'
    expect(extractDepends(section)).toEqual([])
  })

  it('returns empty array when no Depends field', () => {
    const section = 'Some other content'
    expect(extractDepends(section)).toEqual([])
  })

  it('handles case-insensitive matching', () => {
    const section = '**depends:** 1.1, 1.2'
    expect(extractDepends(section)).toEqual(['1.1', '1.2'])
  })
})

describe('extractBlocked', () => {
  it('extracts blocked reason', () => {
    const section = '**Blocked:** Waiting for API approval'
    expect(extractBlocked(section)).toBe('Waiting for API approval')
  })

  it('returns undefined for "None"', () => {
    const section = '**Blocked:** None'
    expect(extractBlocked(section)).toBe(undefined)
  })

  it('returns undefined for empty reason', () => {
    const section = '**Blocked:** '
    expect(extractBlocked(section)).toBe(undefined)
  })

  it('returns undefined when no Blocked field', () => {
    const section = 'Some other content'
    expect(extractBlocked(section)).toBe(undefined)
  })

  it('handles case-insensitive matching', () => {
    const section = '**blocked:** Waiting for review'
    expect(extractBlocked(section)).toBe('Waiting for review')
  })
})

describe('findTaskSectionEnd', () => {
  it('returns next task index when no section delimiter', () => {
    const content = `
#### Task 1.1: First
Some content
#### Task 1.2: Second
`
    const taskStart = content.indexOf('#### Task 1.1')
    const nextTaskIndex = content.indexOf('#### Task 1.2')
    const result = findTaskSectionEnd(content, taskStart, nextTaskIndex)
    expect(result).toBe(nextTaskIndex)
  })

  it('returns section delimiter when before next task', () => {
    const content = `
#### Task 1.1: First
Some content
## Success Criteria
More content
#### Task 1.2: Second
`
    const taskStart = content.indexOf('#### Task 1.1')
    const nextTaskIndex = content.indexOf('#### Task 1.2')
    const sectionDelimiter = content.indexOf('\n## Success Criteria') + 1
    const result = findTaskSectionEnd(content, taskStart, nextTaskIndex)
    expect(result).toBe(sectionDelimiter)
  })

  it('handles --- delimiter', () => {
    const content = `
#### Task 1.1: First
Some content
---
More content
#### Task 1.2: Second
`
    const taskStart = content.indexOf('#### Task 1.1')
    const nextTaskIndex = content.indexOf('#### Task 1.2')
    const sectionDelimiter = content.indexOf('\n---') + 1
    const result = findTaskSectionEnd(content, taskStart, nextTaskIndex)
    expect(result).toBe(sectionDelimiter)
  })

  it('returns content.length for last task', () => {
    const content = `
#### Task 1.1: First
Some content
`
    const taskStart = content.indexOf('#### Task 1.1')
    const result = findTaskSectionEnd(content, taskStart, content.length)
    expect(result).toBe(content.length)
  })
})

describe('extractTaskDescription', () => {
  it('extracts plain text description', () => {
    const section = `
#### Task 1.1: Setup
This is the description.
It has multiple lines.
`
    const result = extractTaskDescription(section)
    expect(result).toBe('This is the description.\nIt has multiple lines.')
  })

  it('excludes metadata lines', () => {
    const section = `
#### Task 1.1: Setup
This is the description.
**Depends:** 1.0
**Blocked:** None
More description.
`
    const result = extractTaskDescription(section)
    expect(result).toBe('This is the description.\nMore description.')
  })

  it('excludes checklist items', () => {
    const section = `
#### Task 1.1: Setup
This is the description.
- [x] First item
- [ ] Second item
`
    const result = extractTaskDescription(section)
    expect(result).toBe('This is the description.')
  })

  it('skips leading empty lines', () => {
    const section = `
#### Task 1.1: Setup

This is the description.
`
    const result = extractTaskDescription(section)
    expect(result).toBe('This is the description.')
  })

  it('returns undefined when no description', () => {
    const section = `
#### Task 1.1: Setup
**Depends:** None
- [ ] First item
`
    const result = extractTaskDescription(section)
    expect(result).toBe(undefined)
  })

  it('preserves empty lines within description', () => {
    const section = `
#### Task 1.1: Setup
First paragraph.

Second paragraph.
`
    const result = extractTaskDescription(section)
    expect(result).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('extracts description from lane-prefixed task headers', () => {
    const section = `
#### [infra] Task 1.4: Configure env
This is the description.
**Status:** todo
`
    const result = extractTaskDescription(section)
    expect(result).toBe('This is the description.')
  })
})
