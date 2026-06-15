import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { readTrustedJsonFile, readJsonFileWithSchema } from './read-json-file.js'

const dirs: string[] = []
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-read-json-file-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('readJsonFile', () => {
  it('parses JSON files', () => {
    const path = join(tmp(), 'data.json')
    writeFileSync(path, '{"ok":true}', 'utf8')
    expect(readTrustedJsonFile<{ ok: boolean }>(path)).toEqual({ ok: true })
  })

  it('adds file path context to parse failures', () => {
    const path = join(tmp(), 'bad.json')
    writeFileSync(path, '{bad', 'utf8')
    expect(() => readTrustedJsonFile(path)).toThrow(
      new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  })

  it('validates JSON files with an explicit schema at trust boundaries', () => {
    const path = join(tmp(), 'data.json')
    writeFileSync(path, '{"ok":true}', 'utf8')

    expect(readJsonFileWithSchema(path, z.object({ ok: z.boolean() }))).toEqual({ ok: true })
  })

  it('adds file path context to schema validation failures', () => {
    const path = join(tmp(), 'invalid-shape.json')
    writeFileSync(path, '{"ok":"yes"}', 'utf8')

    expect(() => readJsonFileWithSchema(path, z.object({ ok: z.boolean() }))).toThrow(
      new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
  })
})
