import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { validatePlanState } from './state.js'

describe('plan state validation (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'state-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('validates in-progress plan from a real markdown file', () => {
    const md = `---
slug: my-plan
status: in-progress
---
# My Plan
## Phase 1
### Task 1.1: Setup
- [x] Done
- [ ] Pending
`
    const dirPath = join(tempDir, 'in-progress')
    mkdirSync(dirPath, { recursive: true })
    const filePath = join(dirPath, '_overview.md')
    writeFileSync(filePath, md)
    const content = readFileSync(filePath, 'utf-8')
    const result = validatePlanState(content, filePath)
    expect(result.valid).toBe(true)
    expect(result.error).toBe(undefined)
  })

  it('validates completed plan must be in completed folder', () => {
    const md = `status: completed
- [x] Task 1
- [x] Task 2
`
    mkdirSync(join(tempDir, 'in-progress'), { recursive: true })
    mkdirSync(join(tempDir, 'completed'), { recursive: true })

    const wrongPath = join(tempDir, 'in-progress', 'plan.md')
    const correctPath = join(tempDir, 'completed', 'plan.md')

    writeFileSync(wrongPath, md)
    const wrongContent = readFileSync(wrongPath, 'utf-8')
    const wrongResult = validatePlanState(wrongContent, wrongPath)
    expect(wrongResult.valid).toBe(false)
    expect(wrongResult.error).toContain('not in completed/ folder')

    writeFileSync(correctPath, md)
    const correctContent = readFileSync(correctPath, 'utf-8')
    const correctResult = validatePlanState(correctContent, correctPath)
    expect(correctResult.valid).toBe(true)
  })

  it('validates draft plan must be in draft folder', () => {
    const md = `status: draft
- [ ] Task 1
- [ ] Task 2
`
    mkdirSync(join(tempDir, 'in-progress'), { recursive: true })
    mkdirSync(join(tempDir, 'draft'), { recursive: true })

    const wrongPath = join(tempDir, 'in-progress', 'plan.md')
    const correctPath = join(tempDir, 'draft', 'plan.md')

    writeFileSync(wrongPath, md)
    const wrongContent = readFileSync(wrongPath, 'utf-8')
    const wrongResult = validatePlanState(wrongContent, wrongPath)
    expect(wrongResult.valid).toBe(false)
    expect(wrongResult.error).toContain('not in draft/ folder')

    writeFileSync(correctPath, md)
    const correctContent = readFileSync(correctPath, 'utf-8')
    const correctResult = validatePlanState(correctContent, correctPath)
    expect(correctResult.valid).toBe(true)
  })

  it('validates completed plan must have all criteria checked', () => {
    const incompleteMd = `status: completed
- [x] Task 1
- [ ] Task 2
`
    mkdirSync(join(tempDir, 'completed'), { recursive: true })
    const filePath = join(tempDir, 'completed', 'incomplete.md')
    writeFileSync(filePath, incompleteMd)
    const content = readFileSync(filePath, 'utf-8')
    const result = validatePlanState(content, filePath)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('1/2 acceptance criteria are checked')
  })

  it('validates draft plan must have no criteria checked', () => {
    const checkedMd = `status: draft
- [x] Task 1
- [ ] Task 2
`
    mkdirSync(join(tempDir, 'draft'), { recursive: true })
    const filePath = join(tempDir, 'draft', 'draft.md')
    writeFileSync(filePath, checkedMd)
    const content = readFileSync(filePath, 'utf-8')
    const result = validatePlanState(content, filePath)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('1 acceptance criteria are checked')
  })

  it('handles complex real-world markdown with frontmatter', () => {
    const md = `---
slug: feature-x
title: Feature X Implementation
status: in-progress
tags: [frontend, api]
---

# Feature X Implementation

## Overview
This plan implements Feature X.

## Acceptance Criteria
- [x] API endpoint created
- [ ] Frontend UI implemented
- [ ] Tests written
- [ ] Documentation updated

## Timeline
Week 1: API
Week 2: Frontend
`
    mkdirSync(join(tempDir, 'active'), { recursive: true })
    const filePath = join(tempDir, 'active', 'feature-x.md')
    writeFileSync(filePath, md)
    const content = readFileSync(filePath, 'utf-8')
    const result = validatePlanState(content, filePath)
    expect(result.valid).toBe(true)
  })
})
