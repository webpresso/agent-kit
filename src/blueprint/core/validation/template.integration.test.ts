import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { validatePlanTemplate } from './template.js'

describe('plan template validation (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'template-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('validates a well-formed plan template from file', () => {
    const md = `---
slug: my-plan
status: in-progress
complexity: M
---
# My Plan

## Context
Some context here.

## Phase 1: Setup
### Task 1.1: Initialize
- [ ] Step one
`
    const filePath = join(tempDir, '_overview.md')
    writeFileSync(filePath, md)
    const content = readFileSync(filePath, 'utf-8')
    const result = validatePlanTemplate(content)
    expect(result).toMatchObject({})
  })

  it('validates minimal markdown', () => {
    const result = validatePlanTemplate('# Minimal\n')
    expect(result).toMatchObject({})
  })
})
