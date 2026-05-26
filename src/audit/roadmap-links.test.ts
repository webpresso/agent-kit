import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { auditRoadmapLinks } from './roadmap-links.js'

function tempRepo() {
  return mkdtempSync(join(tmpdir(), 'webpresso-roadmap-links-'))
}

function writeOverview(root: string, status: string, slug: string, markdown: string) {
  const dir = join(root, 'blueprints', status, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '_overview.md'), markdown)
}

function roadmap(markdownBody: string = '') {
  const body =
    markdownBody.trim().length > 0 && !markdownBody.includes('## Quick Reference (Execution Waves)')
      ? ['## Quick Reference (Execution Waves)', '', markdownBody].join('\n')
      : markdownBody
  return [
    '---',
    'type: parent-roadmap',
    'status: planned',
    'complexity: M',
    "created: '2026-05-06'",
    "last_updated: '2026-05-06'",
    '---',
    '# Roadmap',
    body,
    '',
  ].join('\n')
}

function child(parentRoadmap: string) {
  return [
    '---',
    'type: blueprint',
    'status: planned',
    'complexity: S',
    "created: '2026-05-06'",
    "last_updated: '2026-05-06'",
    `parent_roadmap: ${JSON.stringify(parentRoadmap)}`,
    '---',
    '# Child',
    '#### Task 1.1: Work',
    '**Status:** todo',
    '',
  ].join('\n')
}

describe('auditRoadmapLinks', () => {
  test('passes when roadmap wave map and child parent_roadmap agree', () => {
    const root = tempRepo()
    writeOverview(
      root,
      'planned',
      'roadmap-a',
      roadmap(
        [
          '## Quick Reference (Execution Waves)',
          '',
          '| Wave | Blueprints |',
          '| --- | --- |',
          '| Wave 0 | [child-a](../planned/child-a/_overview.md) |',
        ].join('\n'),
      ),
    )
    writeOverview(root, 'planned', 'child-a', child('roadmap-a'))

    const result = auditRoadmapLinks(root)

    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
    expect(result.violations).toEqual([])
  })

  test('fails when roadmap wave map references a missing child', () => {
    const root = tempRepo()
    writeOverview(
      root,
      'planned',
      'roadmap-a',
      roadmap('| Wave 0 | [missing](../planned/missing/_overview.md) |'),
    )

    const result = auditRoadmapLinks(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'blueprints/planned/roadmap-a/_overview.md',
        message: expect.stringContaining('missing child blueprint'),
      }),
    ])
  })

  test('fails when listed child does not point back to the roadmap', () => {
    const root = tempRepo()
    writeOverview(
      root,
      'planned',
      'roadmap-a',
      roadmap('| Wave 0 | planned/child-a/_overview.md |'),
    )
    writeOverview(
      root,
      'planned',
      'other-roadmap',
      roadmap('| Wave 0 | planned/child-a/_overview.md |'),
    )
    writeOverview(root, 'planned', 'child-a', child('other-roadmap'))

    const result = auditRoadmapLinks(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'blueprints/planned/child-a/_overview.md',
          message: expect.stringContaining('does not resolve back'),
        }),
      ]),
    )
  })

  test('fails when a roadmap has no children', () => {
    const root = tempRepo()
    writeOverview(root, 'planned', 'roadmap-a', roadmap())

    const result = auditRoadmapLinks(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'blueprints/planned/roadmap-a/_overview.md',
        message: 'Roadmap declares no children in its wave map',
      }),
    ])
  })

  test('fails when a local child points to a roadmap but is absent from its wave map', () => {
    const root = tempRepo()
    writeOverview(
      root,
      'planned',
      'roadmap-a',
      roadmap('| Wave 0 | planned/other-child/_overview.md |'),
    )
    writeOverview(root, 'planned', 'other-child', child('roadmap-a'))
    writeOverview(root, 'planned', 'child-a', child('roadmap-a'))

    const result = auditRoadmapLinks(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'blueprints/planned/child-a/_overview.md',
          message: expect.stringContaining('not listed in the roadmap wave map'),
        }),
      ]),
    )
  })

  test('keeps unresolved parent_roadmap soft by default and strict when requested', () => {
    const root = tempRepo()
    writeOverview(root, 'planned', 'child-a', child('missing-roadmap'))

    expect(auditRoadmapLinks(root).ok).toBe(true)

    const strict = auditRoadmapLinks(root, { failOrphans: true })
    expect(strict.ok).toBe(false)
    expect(strict.violations).toEqual([
      expect.objectContaining({
        file: 'blueprints/planned/child-a/_overview.md',
        message: expect.stringContaining('no local parent-roadmap resolves'),
      }),
    ])
  })

  test('fails active children that use cross-repo parent_roadmap labels', () => {
    const root = tempRepo()
    writeOverview(root, 'planned', 'child-a', child('cross-repo: webpresso/monorepo → roadmap-a'))

    const result = auditRoadmapLinks(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'blueprints/planned/child-a/_overview.md',
          message: expect.stringContaining('local roadmap slug/path'),
        }),
      ]),
    )
  })

  test('fails active roadmaps that place GitHub links in the execution wave section', () => {
    const root = tempRepo()
    writeOverview(
      root,
      'planned',
      'roadmap-a',
      roadmap(
        [
          '## Quick Reference (Execution Waves)',
          '',
          '| Wave | Blueprints |',
          '| --- | --- |',
          '| Wave 0 | [framework child](https://github.com/webpresso/framework/blob/main/blueprints/planned/public-secret-surface-hard-cut/_overview.md) |',
          '',
          '## Cross-Plan References',
          '',
          '| Blueprint | Relationship |',
          '| --- | --- |',
          '| [framework child](https://github.com/webpresso/framework/blob/main/blueprints/planned/public-secret-surface-hard-cut/_overview.md) | Documentary only |',
        ].join('\n'),
      ),
    )

    const result = auditRoadmapLinks(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'blueprints/planned/roadmap-a/_overview.md',
          message: expect.stringContaining(
            'execution-wave maps may list local child blueprints only',
          ),
        }),
      ]),
    )
  })

  test('ignores documentary GitHub links outside the execution wave section', () => {
    const root = tempRepo()
    writeOverview(
      root,
      'planned',
      'roadmap-a',
      roadmap(
        [
          '## Quick Reference (Execution Waves)',
          '',
          '| Wave | Blueprints |',
          '| --- | --- |',
          '| Wave 0 | [child-a](../planned/child-a/_overview.md) |',
          '',
          '## Cross-Plan References',
          '',
          '| Blueprint | Relationship |',
          '| --- | --- |',
          '| [framework child](https://github.com/webpresso/framework/blob/main/blueprints/planned/public-secret-surface-hard-cut/_overview.md) | Documentary only |',
        ].join('\n'),
      ),
    )
    writeOverview(root, 'planned', 'child-a', child('roadmap-a'))

    const result = auditRoadmapLinks(root)

    expect(result.ok).toBe(true)
  })
})
