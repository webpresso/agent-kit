import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultConfig } from './config.js'
import { captureConfiguredPreservedFiles, restoreChangedSnapshots } from './preserved-files.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-preserved-files-'))
  tempDirs.push(root)
  return root
}

describe('preserved file snapshots', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('captures only configured existing preserved files', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'docs/templates'), { recursive: true })
    writeFileSync(join(root, 'VISION.md'), 'vision', 'utf8')
    writeFileSync(join(root, 'docs/templates/blueprint.md'), 'blueprint', 'utf8')

    const config = {
      ...defaultConfig(),
      setup: {
        preservePaths: ['VISION.md', 'docs/templates/blueprint.md', 'missing.md'],
      },
    }

    expect(captureConfiguredPreservedFiles(root, config)).toEqual([
      { relativePath: 'VISION.md', content: 'vision' },
      { relativePath: 'docs/templates/blueprint.md', content: 'blueprint' },
    ])
  })

  it('restores changed preserved files without deleting new generated files', () => {
    const root = tempRepo()
    writeFileSync(join(root, 'VISION.md'), 'original vision', 'utf8')
    mkdirSync(join(root, '.agent/commands'), { recursive: true })
    const snapshots = [{ relativePath: 'VISION.md', content: 'original vision' }]

    writeFileSync(join(root, 'VISION.md'), 'generated vision', 'utf8')
    writeFileSync(join(root, '.agent/commands/fix.md'), 'generated command', 'utf8')

    expect(restoreChangedSnapshots(root, snapshots)).toEqual(['VISION.md'])
    expect(readFileSync(join(root, 'VISION.md'), 'utf8')).toBe('original vision')
    expect(readFileSync(join(root, '.agent/commands/fix.md'), 'utf8')).toBe('generated command')
  })

  it('ignores absolute and repo-escaping preserved paths', () => {
    const root = tempRepo()
    const outside = mkdtempSync(join(tmpdir(), 'wp-preserved-files-outside-'))
    tempDirs.push(outside)
    writeFileSync(join(outside, 'outside.txt'), 'outside', 'utf8')

    const config = {
      ...defaultConfig(),
      setup: {
        preservePaths: ['/tmp/outside.txt', '../outside.txt'],
      },
    }

    expect(captureConfiguredPreservedFiles(root, config)).toEqual([])
    expect(
      restoreChangedSnapshots(root, [{ relativePath: '../outside.txt', content: 'mutated' }]),
    ).toEqual([])
    expect(readFileSync(join(outside, 'outside.txt'), 'utf8')).toBe('outside')
  })
})
