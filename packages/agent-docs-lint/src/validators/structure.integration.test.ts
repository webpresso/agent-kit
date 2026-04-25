import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { validateStructure } from './structure'

describe('validateStructure with real files (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'docs-structure-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('validates a document with all required sections', () => {
    const filePath = join(tempDir, 'complete.md')
    writeFileSync(
      filePath,
      `# Overview\n\nSome overview content.\n\n## Usage\n\nUsage info.\n\n## API\n\nAPI docs.\n`,
    )

    const content = readFileSync(filePath, 'utf-8')
    const errors = validateStructure(content, ['Overview', 'Usage', 'API'], filePath)
    expect(errors).toHaveLength(0)
  })

  it('detects missing required sections from real file', () => {
    const filePath = join(tempDir, 'incomplete.md')
    writeFileSync(filePath, '# Overview\n\nOnly an overview.\n')

    const content = readFileSync(filePath, 'utf-8')
    const errors = validateStructure(content, ['Overview', 'Installation', 'API'], filePath)
    expect(errors.length).toBeGreaterThan(0)
  })
})
