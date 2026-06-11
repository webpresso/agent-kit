import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadContent } from './loader.js'

const FIXTURE_ROOT = resolve(fileURLToPath(new URL('./__fixtures__/loader/', import.meta.url)))

const CATALOG = join(FIXTURE_ROOT, 'catalog')
const CONSUMER_CLEAN = join(FIXTURE_ROOT, 'consumer-clean')
const CONSUMER_COLLIDE = join(FIXTURE_ROOT, 'consumer-collide')

describe('loadContent', () => {
  it('loads catalog-only rules + skills with deterministic sort', () => {
    const result = loadContent({ catalogDir: CATALOG })

    expect(result.collisions).toEqual([])
    const summary = result.records.map((r) => ({
      kind: r.kind,
      slug: r.slug,
      source: r.source,
    }))
    expect(summary).toEqual([
      { kind: 'rule', slug: 'alpha', source: 'canonical' },
      { kind: 'rule', slug: 'beta', source: 'canonical' },
      { kind: 'skill', slug: 'skill-with-asset', source: 'canonical' },
    ])
  })

  it('parses frontmatter and body for rules', () => {
    const result = loadContent({ catalogDir: CATALOG, kinds: ['rule'] })
    const alpha = result.records.find((r) => r.slug === 'alpha')
    expect(alpha).not.toBe(undefined)
    expect(alpha?.rawFrontmatter).toMatchObject({
      description: 'Alpha rule',
      priority: 'high',
    })
    expect(alpha?.body).toContain('Alpha rule body.')
    expect(alpha?.assetPaths).toEqual([])
  })

  it('collects skill assets recursively, excluding SKILL.md itself', () => {
    const result = loadContent({ catalogDir: CATALOG, kinds: ['skill'] })
    const skill = result.records.find((r) => r.slug === 'skill-with-asset')
    expect(skill).not.toBe(undefined)
    expect(skill?.assetPaths).toEqual(['helper.ts', 'nested/note.md'])
  })

  it('returns empty consumer records when consumerRoot dirs are absent', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loader-empty-'))
    try {
      const result = loadContent({ catalogDir: CATALOG, consumerRoot: tmp })
      expect(result.collisions).toEqual([])
      expect(result.records.every((r) => r.source === 'canonical')).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('merges canonical + consumer with no collision', () => {
    const result = loadContent({
      catalogDir: CATALOG,
      consumerRoot: CONSUMER_CLEAN,
    })
    expect(result.collisions).toEqual([])
    const slugs = result.records.map((r) => `${r.kind}:${r.slug}:${r.source}`)
    expect(slugs).toContain('rule:gamma:consumer')
    expect(slugs).toContain('skill:extra-skill:consumer')
    expect(slugs).toContain('rule:alpha:canonical')
  })

  it('surfaces collisions without merging or picking a winner', () => {
    const result = loadContent({
      catalogDir: CATALOG,
      consumerRoot: CONSUMER_COLLIDE,
    })

    const ruleCollision = result.collisions.find((c) => c.kind === 'rule' && c.slug === 'alpha')
    const skillCollision = result.collisions.find(
      (c) => c.kind === 'skill' && c.slug === 'skill-with-asset',
    )
    expect(ruleCollision).not.toBe(undefined)
    expect(skillCollision).not.toBe(undefined)

    // Both records should still be present — caller decides resolution.
    const alphaRules = result.records.filter((r) => r.kind === 'rule' && r.slug === 'alpha')
    expect(alphaRules.map((r) => r.source).sort()).toEqual(['canonical', 'consumer'])
  })

  it('throws a clear error when catalogDir is missing', () => {
    expect(() => loadContent({ catalogDir: '/nonexistent/path/xyz' })).toThrow(
      /catalogDir does not exist/,
    )
  })

  it('resolves catalogDir via realpathSync (symlink absorbed)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loader-symlink-'))
    try {
      const linkPath = join(tmp, 'catalog-link')
      symlinkSync(CATALOG, linkPath, 'dir')
      const result = loadContent({ catalogDir: linkPath })
      // filePath of any record must be under the realpath, not the symlink.
      for (const rec of result.records) {
        expect(rec.filePath.startsWith(linkPath)).toBe(false)
        expect(rec.filePath.startsWith(CATALOG)).toBe(true)
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('honors `kinds` option to scope discovery', () => {
    const onlyRules = loadContent({ catalogDir: CATALOG, kinds: ['rule'] })
    expect(onlyRules.records.every((r) => r.kind === 'rule')).toBe(true)

    const onlySkills = loadContent({ catalogDir: CATALOG, kinds: ['skill'] })
    expect(onlySkills.records.every((r) => r.kind === 'skill')).toBe(true)
  })

  it('omits skill dirs missing a SKILL.md', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'loader-no-skill-md-'))
    try {
      const catalogDir = join(tmp, 'catalog')
      mkdirSync(join(catalogDir, 'rules'), { recursive: true })
      mkdirSync(join(catalogDir, 'skills', 'orphan'), { recursive: true })
      writeFileSync(join(catalogDir, 'skills', 'orphan', 'random.txt'), 'x')

      const result = loadContent({ catalogDir })
      expect(result.records).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
