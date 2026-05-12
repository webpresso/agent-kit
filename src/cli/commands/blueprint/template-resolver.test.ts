import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listTemplates, resolveTemplate } from './template-resolver.js'

function makeTmpDir(prefix: string): string {
  const dir = path.join(tmpdir(), `${prefix}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('listTemplates', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir('template-resolver-test')
  })

  afterEach(() => {
    // No explicit cleanup — OS temp GC handles it
  })

  it('returns empty array for empty directory', () => {
    const result = listTemplates(tmpDir)
    expect(result).toStrictEqual([])
  })

  it('returns entries for .md files in the directory', () => {
    writeFileSync(path.join(tmpDir, 'blueprint.md'), '# Blueprint\n')
    writeFileSync(path.join(tmpDir, 'guide.md'), '# Guide\n')

    const result = listTemplates(tmpDir)
    const names = result.map((e) => e.name).toSorted()
    expect(names).toStrictEqual(['blueprint', 'guide'])
  })

  it('ignores non-.md files', () => {
    writeFileSync(path.join(tmpDir, 'blueprint.md'), '# Blueprint\n')
    writeFileSync(path.join(tmpDir, 'blueprint.yaml'), 'type: blueprint\n')
    writeFileSync(path.join(tmpDir, 'notes.txt'), 'notes\n')

    const result = listTemplates(tmpDir)
    expect(result.map((e) => e.name)).toStrictEqual(['blueprint'])
  })

  it('deduplicates names: both blueprint.md and blueprint.yaml yield one entry', () => {
    writeFileSync(path.join(tmpDir, 'adr.md'), '# ADR\n')
    writeFileSync(path.join(tmpDir, 'adr.yaml'), 'type: adr\n')

    const result = listTemplates(tmpDir)
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toStrictEqual('adr')
  })

  it('returns { name, path } entries with correct absolute paths', () => {
    writeFileSync(path.join(tmpDir, 'runbook.md'), '# Runbook\n')

    const result = listTemplates(tmpDir)
    expect(result).toHaveLength(1)
    expect(result[0]).toStrictEqual({
      name: 'runbook',
      path: path.join(tmpDir, 'runbook.md'),
    })
  })

  it('handles directory with only .yaml files (no .md) — returns empty', () => {
    writeFileSync(path.join(tmpDir, 'core-doc.yaml'), 'type: core-doc\n')

    const result = listTemplates(tmpDir)
    expect(result).toStrictEqual([])
  })
})

describe('resolveTemplate', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir('resolve-template-test')
  })

  it('returns null for unknown template name', () => {
    writeFileSync(path.join(tmpDir, 'blueprint.md'), '# Blueprint\n')

    const result = resolveTemplate('nonexistent', tmpDir)
    expect(result).toBeNull()
  })

  it('returns the absolute path for a known template name', () => {
    writeFileSync(path.join(tmpDir, 'blueprint.md'), '# Blueprint\n')

    const result = resolveTemplate('blueprint', tmpDir)
    expect(result).toStrictEqual(path.join(tmpDir, 'blueprint.md'))
  })

  it('returns null when directory is empty', () => {
    const result = resolveTemplate('blueprint', tmpDir)
    expect(result).toBeNull()
  })

  it('returns the .md path even when a same-name .yaml also exists', () => {
    writeFileSync(path.join(tmpDir, 'guide.md'), '# Guide\n')
    writeFileSync(path.join(tmpDir, 'guide.yaml'), 'type: guide\n')

    const result = resolveTemplate('guide', tmpDir)
    expect(result).toStrictEqual(path.join(tmpDir, 'guide.md'))
  })

  it('is case-sensitive: "Blueprint" does not match "blueprint.md"', () => {
    writeFileSync(path.join(tmpDir, 'blueprint.md'), '# Blueprint\n')

    const result = resolveTemplate('Blueprint', tmpDir)
    expect(result).toBeNull()
  })
})
