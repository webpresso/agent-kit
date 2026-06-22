import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { writeFileAtomic, writeJsonFile, writeJsonFileAtomic } from './write-json-file.js'
import { _resetAtomicFileOpsForTests, _setAtomicFileOpsForTests } from './write-json-file.js'

const dirs: string[] = []
function tmp(): string {
  const dir = fs.mkdtempSync(join(tmpdir(), 'ak-write-json-file-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  _resetAtomicFileOpsForTests()
  vi.restoreAllMocks()
  while (dirs.length > 0) fs.rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('writeJsonFile', () => {
  it('writes pretty JSON with trailing newline by default', () => {
    const path = join(tmp(), 'data.json')
    writeJsonFile(path, { ok: true })
    expect(fs.readFileSync(path, 'utf8')).toBe('{\n  "ok": true\n}\n')
  })

  it('supports compact JSON and no trailing newline', () => {
    const path = join(tmp(), 'data.json')
    writeJsonFile(path, { ok: true }, { indent: 0, trailingNewline: false })
    expect(fs.readFileSync(path, 'utf8')).toBe('{"ok":true}')
  })

  it('supports an atomic JSON option', () => {
    const dir = tmp()
    const path = join(dir, 'data.json')
    writeJsonFile(path, { ok: true }, { atomic: true })
    expect(fs.readFileSync(path, 'utf8')).toBe('{\n  "ok": true\n}\n')
    expect(fs.readdirSync(dir).filter((name) => name.includes('.tmp-'))).toStrictEqual([])
  })

  it('provides an atomic JSON convenience wrapper', () => {
    const path = join(tmp(), 'data.json')
    writeJsonFileAtomic(path, { ok: true }, { indent: 0, trailingNewline: false })
    expect(fs.readFileSync(path, 'utf8')).toBe('{"ok":true}')
  })
})

describe('writeFileAtomic', () => {
  it('writes raw content through a temp file and leaves no temp behind', () => {
    const dir = tmp()
    const path = join(dir, 'data.md')
    writeFileAtomic(path, '# hello\n', 'utf8')
    expect(fs.readFileSync(path, 'utf8')).toBe('# hello\n')
    expect(fs.readdirSync(dir).filter((name) => name.includes('.tmp-'))).toStrictEqual([])
  })

  it('cleans up the temp file when rename fails', () => {
    const dir = tmp()
    const path = join(dir, 'data.md')
    _setAtomicFileOpsForTests({
      renameSync: () => {
        throw new Error('rename failed')
      },
    })
    expect(() => writeFileAtomic(path, '# hello\n', 'utf8')).toThrow(/rename failed/)
    expect(fs.existsSync(path)).toBe(false)
    expect(fs.readdirSync(dir).filter((name) => name.includes('.tmp-'))).toStrictEqual([])
  })

  it('falls back to copy and unlink on cross-device rename errors', () => {
    const dir = tmp()
    const path = join(dir, 'data.md')
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    _setAtomicFileOpsForTests({
      renameSync: () => {
        const error = new Error('cross-device')
        ;(error as Error & { code?: string }).code = 'EXDEV'
        throw error
      },
    })
    writeFileAtomic(path, '# hello\n', 'utf8')
    expect(fs.readFileSync(path, 'utf8')).toBe('# hello\n')
    expect(fs.readdirSync(dir).filter((name) => name.includes('.tmp-'))).toStrictEqual([])
  })
})
