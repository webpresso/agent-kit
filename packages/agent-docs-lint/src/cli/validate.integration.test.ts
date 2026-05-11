import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseFrontmatter } from '#parsers/frontmatter'

describe('parseFrontmatter with real files (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'docs-linter-'))
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('parses frontmatter from a real markdown file', () => {
    const filePath = join(tempDir, 'good-guide.md')
    writeFileSync(
      filePath,
      `---
type: guide
last_updated: 2025-01-01
---

# Good Guide

Content here.
`,
    )

    const content = readFileSync(filePath, 'utf-8')
    const result = parseFrontmatter(content)

    expect(result.hasFrontmatter).toBe(true)
    expect(result.frontmatter.type).toBe('guide')
    expect(result.content).toContain('Good Guide')
  })

  it('detects missing frontmatter in real file', () => {
    const filePath = join(tempDir, 'no-frontmatter.md')
    writeFileSync(filePath, '# No Frontmatter\n\nJust content.\n')

    const content = readFileSync(filePath, 'utf-8')
    const result = parseFrontmatter(content)

    expect(result.hasFrontmatter).toBe(false)
    expect(result.frontmatter).toEqual({})
  })
})
