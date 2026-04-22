import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parsePlan } from './plan-parser'

describe('plan-parser (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plan-parser-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('parses a real markdown plan file', () => {
    const markdown = `# My Blueprint

## Phase 1: Setup
### Task 1.1: Create database
- [ ] Design schema
- [ ] Run migrations

### Task 1.2: Build API
- [x] Define routes
`
    const filePath = join(tempDir, 'plan.md')
    writeFileSync(filePath, markdown)
    const content = readFileSync(filePath, 'utf-8')
    const plan = parsePlan(content)
    expect(plan.tasks.length).toBeGreaterThan(0)
  })

  it('parses empty plan', () => {
    const plan = parsePlan('# Empty Plan\n')
    expect(plan.tasks).toHaveLength(0)
  })
})
