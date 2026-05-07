import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  applyBlueprintLifecycleToFile,
  isValidBlueprintSlug,
  resolveBlueprintFile,
} from './local.js'

const BLUEPRINT_TEMPLATE = `---
type: blueprint
status: planned
complexity: S
last_updated: 2026-04-02
created: 2026-04-02
---

# test-blueprint

## Implementation

#### Task 1.1: First task
**Status:** done

**Acceptance:**
- [x] Criterion A
`

function writeBlueprint(projectRoot: string, status: string, slug: string): string {
  const dir = path.join(projectRoot, 'webpresso', 'blueprints', status, slug)
  mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, '_overview.md')
  writeFileSync(filePath, BLUEPRINT_TEMPLATE.replace('status: planned', `status: ${status}`))
  return filePath
}

function writeConsumerBlueprint(projectRoot: string, status: string, slug: string): string {
  const dir = path.join(projectRoot, 'blueprints', status, slug)
  mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, '_overview.md')
  writeFileSync(filePath, BLUEPRINT_TEMPLATE.replace('status: planned', `status: ${status}`))
  return filePath
}

describe('applyBlueprintLifecycleToFile', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('removes empty source parent directory after move to prevent stale leftovers', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'wp-lifecycle-stale-'))
    tempDirs.push(projectRoot)
    mkdirSync(path.join(projectRoot, 'webpresso'), { recursive: true })
    writeFileSync(path.join(projectRoot, 'webpresso', 'config.yaml'), 'project:\n  name: test\n')
    writeBlueprint(projectRoot, 'in-progress', 'test-blueprint')

    const result = await applyBlueprintLifecycleToFile(projectRoot, 'test-blueprint', {
      type: 'finalize',
    })

    expect(result.moved).toBe(true)

    const oldBlueprintDir = path.join(
      projectRoot,
      'webpresso',
      'blueprints',
      'in-progress',
      'test-blueprint',
    )
    expect(existsSync(oldBlueprintDir)).toBe(false)

    const oldStatusDir = path.join(projectRoot, 'webpresso', 'blueprints', 'in-progress')
    expect(existsSync(oldStatusDir)).toBe(false)

    const newPath = path.join(
      projectRoot,
      'webpresso',
      'blueprints',
      'completed',
      'test-blueprint',
      '_overview.md',
    )
    expect(existsSync(newPath)).toBe(true)
  })

  it('moves generic consumer blueprints within top-level blueprints/', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'ak-lifecycle-generic-'))
    tempDirs.push(projectRoot)
    writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"consumer"}')
    writeConsumerBlueprint(projectRoot, 'in-progress', 'test-blueprint')

    const result = await applyBlueprintLifecycleToFile(projectRoot, 'test-blueprint', {
      type: 'finalize',
    })

    expect(result.moved).toBe(true)
    expect(existsSync(path.join(projectRoot, 'blueprints', 'in-progress', 'test-blueprint'))).toBe(
      false,
    )
    expect(
      existsSync(
        path.join(projectRoot, 'blueprints', 'completed', 'test-blueprint', '_overview.md'),
      ),
    ).toBe(true)
    expect(existsSync(path.join(projectRoot, 'webpresso'))).toBe(false)
  })

  it('preserves source parent directory when other blueprints remain', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'wp-lifecycle-preserve-'))
    tempDirs.push(projectRoot)
    mkdirSync(path.join(projectRoot, 'webpresso'), { recursive: true })
    writeFileSync(path.join(projectRoot, 'webpresso', 'config.yaml'), 'project:\n  name: test\n')
    writeBlueprint(projectRoot, 'in-progress', 'test-blueprint')
    writeBlueprint(projectRoot, 'in-progress', 'other-blueprint')

    await applyBlueprintLifecycleToFile(projectRoot, 'test-blueprint', {
      type: 'finalize',
    })

    const oldStatusDir = path.join(projectRoot, 'webpresso', 'blueprints', 'in-progress')
    expect(existsSync(oldStatusDir)).toBe(true)

    const otherBlueprint = path.join(oldStatusDir, 'other-blueprint', '_overview.md')
    expect(existsSync(otherBlueprint)).toBe(true)
  })
})

describe('isValidBlueprintSlug', () => {
  it.each([
    'platform-web-explosion',
    'in-progress/platform-web-explosion',
    'draft/alpha/beta-plan',
    'completed/plan-123',
  ])('accepts valid slug %s', (slug) => {
    expect(isValidBlueprintSlug(slug)).toBe(true)
  })

  it.each([
    '',
    ' ',
    '`',
    'Platform-Web-Explosion',
    'platform_web_explosion',
    'platform web explosion',
    'in-progress/',
    '/platform-web-explosion',
    'in-progress//platform-web-explosion',
    ' in-progress/platform-web-explosion',
    'in-progress/platform-web-explosion ',
    'planned/.hidden-plan',
  ])('rejects malformed slug %s', (slug) => {
    expect(isValidBlueprintSlug(slug)).toBe(false)
  })
})

describe('resolveBlueprintFile', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects malformed slug input even if a matching invalid directory exists on disk', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'wp-resolve-invalid-'))
    tempDirs.push(projectRoot)
    mkdirSync(path.join(projectRoot, 'webpresso'), { recursive: true })
    writeFileSync(path.join(projectRoot, 'webpresso', 'config.yaml'), 'project:\n  name: test\n')
    writeBlueprint(projectRoot, 'in-progress', '`')

    await expect(resolveBlueprintFile(projectRoot, '`')).rejects.toThrow(
      'Invalid blueprint slug: `.',
    )
  })

  it('resolves valid nested slugs by exact match and suffix match', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'wp-resolve-valid-'))
    tempDirs.push(projectRoot)
    mkdirSync(path.join(projectRoot, 'webpresso'), { recursive: true })
    writeFileSync(path.join(projectRoot, 'webpresso', 'config.yaml'), 'project:\n  name: test\n')
    const expectedPath = writeBlueprint(projectRoot, 'in-progress', 'alpha/platform-web-explosion')

    const exact = await resolveBlueprintFile(
      projectRoot,
      'in-progress/alpha/platform-web-explosion',
    )
    expect(exact.path).toBe(expectedPath)
    expect(exact.slug).toBe('in-progress/alpha/platform-web-explosion')

    const suffix = await resolveBlueprintFile(projectRoot, 'platform-web-explosion')
    expect(suffix.path).toBe(expectedPath)
    expect(suffix.slug).toBe('in-progress/alpha/platform-web-explosion')
  })

  it('rejects duplicate slugs across lifecycle folders with an explicit ambiguity message', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'wp-resolve-duplicate-'))
    tempDirs.push(projectRoot)
    mkdirSync(path.join(projectRoot, 'webpresso'), { recursive: true })
    writeFileSync(path.join(projectRoot, 'webpresso', 'config.yaml'), 'project:\n  name: test\n')
    writeBlueprint(projectRoot, 'planned', 'duplicate-slug')
    writeBlueprint(projectRoot, 'completed', 'duplicate-slug')

    await expect(resolveBlueprintFile(projectRoot, 'duplicate-slug')).rejects.toThrow(
      'Blueprint slug "duplicate-slug" is ambiguous across lifecycle folders.',
    )
    await expect(resolveBlueprintFile(projectRoot, 'duplicate-slug')).rejects.toThrow(
      'planned/duplicate-slug',
    )
    await expect(resolveBlueprintFile(projectRoot, 'duplicate-slug')).rejects.toThrow(
      'completed/duplicate-slug',
    )
  })
})
