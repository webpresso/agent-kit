import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { writeJsonFile } from './write-json-file.js'

const dirs: string[] = []
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-write-json-file-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('writeJsonFile', () => {
  it('writes pretty JSON with trailing newline by default', () => {
    const path = join(tmp(), 'data.json')
    writeJsonFile(path, { ok: true })
    expect(readFileSync(path, 'utf8')).toBe('{\n  "ok": true\n}\n')
  })

  it('supports compact JSON and no trailing newline', () => {
    const path = join(tmp(), 'data.json')
    writeJsonFile(path, { ok: true }, { indent: 0, trailingNewline: false })
    expect(readFileSync(path, 'utf8')).toBe('{"ok":true}')
  })
})
