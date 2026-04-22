import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  checkAllCheckboxes,
  checkFirstCheckbox,
  extractTaskSection,
  updateBlockedReason,
} from './helpers.js'

describe('markdown helpers (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'md-helpers-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const blueprint = `### Phase 1
#### [backend] Task 1.1: Setup database
- [ ] Create schema
- [ ] Run migrations
#### [ui] Task 1.2: Build API
- [ ] Define routes
`

  it('extracts task section from real markdown file', () => {
    const filePath = join(tempDir, 'blueprint.md')
    writeFileSync(filePath, blueprint)
    const content = readFileSync(filePath, 'utf-8')
    const section = extractTaskSection(content, '1.1')
    expect(section).toContain('Setup database')
    expect(section).toContain('Create schema')
  })

  it('checks first checkbox in task', () => {
    const filePath = join(tempDir, 'check-first.md')
    writeFileSync(filePath, blueprint)
    const content = readFileSync(filePath, 'utf-8')
    const updated = checkFirstCheckbox(content, '1.1')
    writeFileSync(filePath, updated)
    const result = readFileSync(filePath, 'utf-8')
    expect(result).toContain('[x] Create schema')
    expect(result).toContain('[ ] Run migrations')
  })

  it('checks all checkboxes in task', () => {
    const updated = checkAllCheckboxes(blueprint, '1.1')
    const filePath = join(tempDir, 'check-all.md')
    writeFileSync(filePath, updated)
    const result = readFileSync(filePath, 'utf-8')
    expect(result).toContain('[x] Create schema')
    expect(result).toContain('[x] Run migrations')
  })

  it('updates blocked reason for a task', () => {
    const updated = updateBlockedReason(blueprint, '1.2', 'Waiting for DB setup')
    const filePath = join(tempDir, 'blocked.md')
    writeFileSync(filePath, updated)
    const result = readFileSync(filePath, 'utf-8')
    expect(result).toContain('Waiting for DB setup')
  })
})
