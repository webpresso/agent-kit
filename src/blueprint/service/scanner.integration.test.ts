import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { scanBlueprintDirectory } from './scanner'

describe('scanBlueprintDirectory (integration)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'blueprint-scan-'))

    mkdirSync(join(tempDir, 'in-progress', 'feature-a'), { recursive: true })
    writeFileSync(
      join(tempDir, 'in-progress', 'feature-a', '_overview.md'),
      '---\nstatus: in-progress\ncomplexity: M\n---\n# Feature A\n',
    )

    mkdirSync(join(tempDir, 'completed', 'feature-b'), { recursive: true })
    writeFileSync(
      join(tempDir, 'completed', 'feature-b', '_overview.md'),
      '---\nstatus: completed\ncomplexity: S\n---\n# Feature B\n',
    )

    mkdirSync(join(tempDir, '_future', 'idea-c'), { recursive: true })
    writeFileSync(
      join(tempDir, '_future', 'idea-c', '_overview.md'),
      '---\nstatus: future\ncomplexity: L\n---\n# Idea C\n',
    )
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('discovers _overview.md files from real filesystem', () => {
    const results = scanBlueprintDirectory({ baseDir: tempDir })

    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results.some((r) => r.slug.includes('feature-a'))).toBe(true)
    expect(results.some((r) => r.slug.includes('feature-b'))).toBe(true)
  })

  it('excludes special folders by default', () => {
    const results = scanBlueprintDirectory({ baseDir: tempDir })
    expect(results.some((r) => r.slug.includes('idea-c'))).toBe(false)
  })

  it('includes special folders when requested', () => {
    const results = scanBlueprintDirectory({
      baseDir: tempDir,
      includeSpecialFolders: true,
    })
    expect(results.some((r) => r.slug.includes('idea-c'))).toBe(true)
    const ideaC = results.find((r) => r.slug.includes('idea-c'))
    expect(ideaC?.isSpecialFolder).toBe(true)
    expect(ideaC?.specialFolderType).toBe('_future')
  })

  it('extracts group from directory structure', () => {
    const results = scanBlueprintDirectory({ baseDir: tempDir })
    const featureA = results.find((r) => r.slug.includes('feature-a'))
    expect(featureA?.group).toBe('in-progress')
  })

  it('returns empty array for nonexistent directory', () => {
    const results = scanBlueprintDirectory({ baseDir: '/nonexistent/path' })
    expect(results).toEqual([])
  })
})
