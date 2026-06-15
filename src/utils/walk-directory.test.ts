import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { walkDirectory } from './walk-directory.js'

const dirs: string[] = []
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-walk-directory-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('walkDirectory', () => {
  it('returns sorted file paths and filters by extension', () => {
    const root = tmp()
    mkdirSync(join(root, 'b'), { recursive: true })
    mkdirSync(join(root, 'a'), { recursive: true })
    writeFileSync(join(root, 'b', 'two.txt'), '2')
    writeFileSync(join(root, 'a', 'one.md'), '1')
    writeFileSync(join(root, 'z.md'), 'z')

    expect(walkDirectory(root, { extensions: ['.md'], absolute: false })).toEqual([
      'a/one.md',
      'z.md',
    ])
  })

  it('skips configured directories and symlinks', () => {
    const root = tmp()
    mkdirSync(join(root, 'keep'), { recursive: true })
    mkdirSync(join(root, 'skip'), { recursive: true })
    writeFileSync(join(root, 'keep', 'one.md'), '1')
    writeFileSync(join(root, 'skip', 'two.md'), '2')
    symlinkSync(join(root, 'keep', 'one.md'), join(root, 'link.md'))

    expect(
      walkDirectory(root, { extensions: ['.md'], skipDirs: ['skip'], absolute: false }),
    ).toEqual(['keep/one.md'])
  })

  it('throws with path context for missing roots', () => {
    expect(() => walkDirectory(join(tmp(), 'missing'))).toThrow(/missing/)
  })
})
