import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { copyDirectoryMerged, copyFileMerged, writeFileMerged } from './merge.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `wp-init-merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('writeFileMerged', () => {
  let dir: string

  beforeEach(() => {
    dir = makeTempDir()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates a new file when target does not exist', () => {
    const target = join(dir, 'sub', 'file.md')
    const result = writeFileMerged(target, 'hello')
    expect(result.action).toBe('created')
    expect(readFileSync(target, 'utf8')).toBe('hello')
  })

  it('reports identical when content matches exactly', () => {
    const target = join(dir, 'file.md')
    writeFileSync(target, 'same')
    const result = writeFileMerged(target, 'same')
    expect(result.action).toBe('identical')
  })

  it('reports drift without writing companion files when content differs and overwrite is false', () => {
    const target = join(dir, 'file.md')
    writeFileSync(target, 'original')
    const result = writeFileMerged(target, 'updated')
    expect(result.action).toBe('drifted')
    expect(readFileSync(target, 'utf8')).toBe('original')
    expect(existsSync(`${target}.new`)).toBe(false)
  })

  it('overwrites when overwrite is true', () => {
    const target = join(dir, 'file.md')
    writeFileSync(target, 'original')
    const result = writeFileMerged(target, 'updated', { overwrite: true })
    expect(result.action).toBe('overwritten')
    expect(readFileSync(target, 'utf8')).toBe('updated')
  })

  it('overwrites generated whole-file outputs by default', () => {
    const target = join(dir, 'file.md')
    writeFileSync(target, 'original')
    const result = writeFileMerged(target, 'updated', {
      ownership: 'generated-whole-file',
    })
    expect(result.action).toBe('overwritten')
    expect(readFileSync(target, 'utf8')).toBe('updated')
  })

  it('in dry-run mode, no writes happen and action is skipped-dry', () => {
    const target = join(dir, 'file.md')
    writeFileSync(target, 'original')
    const result = writeFileMerged(target, 'updated', { dryRun: true })
    expect(result.action).toBe('skipped-dry')
    expect(existsSync(`${target}.new`)).toBe(false)
    expect(readFileSync(target, 'utf8')).toBe('original')
  })

  it('in dry-run mode with overwrite, still does not write', () => {
    const target = join(dir, 'file.md')
    writeFileSync(target, 'original')
    const result = writeFileMerged(target, 'updated', { dryRun: true, overwrite: true })
    expect(result.action).toBe('skipped-dry')
    expect(readFileSync(target, 'utf8')).toBe('original')
  })

  it('in dry-run mode, generated whole-file outputs still do not write', () => {
    const target = join(dir, 'file.md')
    writeFileSync(target, 'original')
    const result = writeFileMerged(target, 'updated', {
      dryRun: true,
      ownership: 'generated-whole-file',
    })
    expect(result.action).toBe('skipped-dry')
    expect(readFileSync(target, 'utf8')).toBe('original')
  })
})

describe('copyFileMerged / copyDirectoryMerged', () => {
  let src: string
  let dst: string

  beforeEach(() => {
    src = makeTempDir()
    dst = makeTempDir()
  })

  afterEach(() => {
    rmSync(src, { recursive: true, force: true })
    rmSync(dst, { recursive: true, force: true })
  })

  it('copies a single file', () => {
    writeFileSync(join(src, 'a.md'), 'content')
    const result = copyFileMerged(join(src, 'a.md'), join(dst, 'a.md'))
    expect(result.action).toBe('created')
    expect(readFileSync(join(dst, 'a.md'), 'utf8')).toBe('content')
  })

  it('copies a directory recursively with nested content', () => {
    mkdirSync(join(src, 'nested'), { recursive: true })
    writeFileSync(join(src, 'a.md'), 'a')
    writeFileSync(join(src, 'nested', 'b.md'), 'b')
    const results = copyDirectoryMerged(src, dst)
    expect(results.length).toBe(2)
    expect(readFileSync(join(dst, 'a.md'), 'utf8')).toBe('a')
    expect(readFileSync(join(dst, 'nested', 'b.md'), 'utf8')).toBe('b')
  })

  it('reports drift per-file when nested conflicts exist', () => {
    mkdirSync(join(src, 'nested'), { recursive: true })
    writeFileSync(join(src, 'nested', 'b.md'), 'new')
    mkdirSync(join(dst, 'nested'), { recursive: true })
    writeFileSync(join(dst, 'nested', 'b.md'), 'old')
    const results = copyDirectoryMerged(src, dst)
    expect(results.some((r) => r.action === 'drifted')).toBe(true)
    expect(readFileSync(join(dst, 'nested', 'b.md'), 'utf8')).toBe('old')
    expect(existsSync(join(dst, 'nested', 'b.md.new'))).toBe(false)
  })

  it('refreshes generated directories by default while preserving consumer-owned defaults elsewhere', () => {
    mkdirSync(join(src, 'nested'), { recursive: true })
    writeFileSync(join(src, 'nested', 'b.md'), 'new')
    mkdirSync(join(dst, 'nested'), { recursive: true })
    writeFileSync(join(dst, 'nested', 'b.md'), 'old')

    const results = copyDirectoryMerged(src, dst, { ownership: 'generated-whole-file' })

    expect(results).toEqual([{ targetPath: join(dst, 'nested', 'b.md'), action: 'overwritten' }])
    expect(readFileSync(join(dst, 'nested', 'b.md'), 'utf8')).toBe('new')
  })
})
