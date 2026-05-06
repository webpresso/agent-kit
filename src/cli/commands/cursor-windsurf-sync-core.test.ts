import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { syncCursorWindsurfSkills } from './cursor-windsurf-sync-core.js'

const SOURCE = '/fake/catalog/skills'
const TARGET_A = '/fake/repo/.cursor/rules'
const TARGET_B = '/fake/repo/.windsurf/skills'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(sourceFiles: string[]) {
  const readDir = vi.fn().mockResolvedValue(sourceFiles)
  const copyFile = vi.fn().mockResolvedValue(undefined)
  const mkdir = vi.fn().mockResolvedValue(undefined)
  return { readDir, copyFile, mkdir }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncCursorWindsurfSkills', () => {
  describe('empty source dir', () => {
    it('returns empty report when no files in sourceDir', async () => {
      const deps = makeDeps([])
      const report = await syncCursorWindsurfSkills(SOURCE, [TARGET_A, TARGET_B], deps)

      expect(report.copied).toStrictEqual([])
      expect(report.skipped).toStrictEqual([])
    })

    it('still calls mkdir for each target', async () => {
      const deps = makeDeps([])
      await syncCursorWindsurfSkills(SOURCE, [TARGET_A, TARGET_B], deps)

      expect(deps.mkdir).toHaveBeenCalledWith(TARGET_A, { recursive: true })
      expect(deps.mkdir).toHaveBeenCalledWith(TARGET_B, { recursive: true })
    })
  })

  describe('source with skill files', () => {
    it('builds copied entries with correct src and dst paths', async () => {
      const deps = makeDeps(['foo.md', 'bar.md'])
      const report = await syncCursorWindsurfSkills(SOURCE, [TARGET_A], deps)

      expect(report.copied).toStrictEqual([
        { src: path.join(SOURCE, 'foo.md'), dst: path.join(TARGET_A, 'foo.md') },
        { src: path.join(SOURCE, 'bar.md'), dst: path.join(TARGET_A, 'bar.md') },
      ])
    })

    it('copies to all target dirs', async () => {
      const deps = makeDeps(['skill.md'])
      const report = await syncCursorWindsurfSkills(SOURCE, [TARGET_A, TARGET_B], deps)

      expect(report.copied).toStrictEqual([
        { src: path.join(SOURCE, 'skill.md'), dst: path.join(TARGET_A, 'skill.md') },
        { src: path.join(SOURCE, 'skill.md'), dst: path.join(TARGET_B, 'skill.md') },
      ])
    })

    it('ignores non-.md files', async () => {
      const deps = makeDeps(['skill.md', 'notes.txt', 'image.png'])
      const report = await syncCursorWindsurfSkills(SOURCE, [TARGET_A], deps)

      expect(report.copied).toHaveLength(1)
      expect(report.copied[0]?.src).toBe(path.join(SOURCE, 'skill.md'))
    })
  })

  describe('mkdir called for each target', () => {
    it('calls mkdir with recursive:true before copying', async () => {
      const deps = makeDeps(['a.md'])
      await syncCursorWindsurfSkills(SOURCE, [TARGET_A, TARGET_B], deps)

      expect(deps.mkdir).toHaveBeenCalledWith(TARGET_A, { recursive: true })
      expect(deps.mkdir).toHaveBeenCalledWith(TARGET_B, { recursive: true })
      expect(deps.mkdir).toHaveBeenCalledTimes(2)
    })
  })

  describe('copyFile called with exact src/dst pairs', () => {
    it('passes correct src and dst to copyFile', async () => {
      const deps = makeDeps(['skill.md'])
      await syncCursorWindsurfSkills(SOURCE, [TARGET_A, TARGET_B], deps)

      expect(deps.copyFile).toHaveBeenCalledWith(
        path.join(SOURCE, 'skill.md'),
        path.join(TARGET_A, 'skill.md'),
      )
      expect(deps.copyFile).toHaveBeenCalledWith(
        path.join(SOURCE, 'skill.md'),
        path.join(TARGET_B, 'skill.md'),
      )
    })
  })

  describe('copyFile throws for one file', () => {
    it('adds failed file to skipped with reason', async () => {
      const deps = makeDeps(['good.md', 'bad.md'])
      deps.copyFile.mockImplementation(async (src: string) => {
        if (src.endsWith('bad.md')) throw new Error('permission denied')
      })

      const report = await syncCursorWindsurfSkills(SOURCE, [TARGET_A], deps)

      const badSkipped = report.skipped.find((s: {src: string; dst: string}) => s.path.endsWith('bad.md'))
      expect(badSkipped).toBeDefined()
      expect(badSkipped?.reason).toContain('permission denied')

      // good.md still copied
      const goodCopied = report.copied.find((c: {src: string; dst: string}) => c.src.endsWith('good.md'))
      expect(goodCopied).toBeDefined()
    })

    it('continues copying other files after one failure', async () => {
      const deps = makeDeps(['a.md', 'b.md', 'c.md'])
      deps.copyFile.mockImplementation(async (src: string) => {
        if (src.endsWith('b.md')) throw new Error('disk full')
      })

      const report = await syncCursorWindsurfSkills(SOURCE, [TARGET_A], deps)

      expect(report.copied).toHaveLength(2)
      expect(report.skipped).toHaveLength(1)
      expect(report.skipped[0]?.reason).toContain('disk full')
    })
  })
})
