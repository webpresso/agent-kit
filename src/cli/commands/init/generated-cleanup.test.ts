import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defaultConfig } from './config.js'
import { removeConfiguredGeneratedPaths } from './generated-cleanup.js'

const tempDirs: string[] = []

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-generated-cleanup-'))
  tempDirs.push(root)
  return root
}

describe('removeConfiguredGeneratedPaths', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('removes configured deprecated generated surfaces only when present', () => {
    const root = tempRepo()
    mkdirSync(join(root, '.github', 'actions', 'setup-webpresso'), { recursive: true })
    writeFileSync(join(root, '.github', 'actions', 'setup-webpresso', 'action.yml'), 'name: setup')
    mkdirSync(join(root, 'scripts'), { recursive: true })
    writeFileSync(
      join(root, 'scripts', 'resolve-webpresso-cli-versions.js'),
      'throw new Error("no")',
    )

    const config = {
      ...defaultConfig(),
      generatedCleanup: {
        removePaths: [
          '.github/actions/setup-webpresso/action.yml',
          'scripts/resolve-webpresso-cli-versions.js',
          '.github/actions/setup-monorepo/action.yml',
        ],
      },
    }

    expect(removeConfiguredGeneratedPaths(root, config)).toEqual([
      '.github/actions/setup-webpresso/action.yml',
      'scripts/resolve-webpresso-cli-versions.js',
    ])
    expect(existsSync(join(root, '.github/actions/setup-webpresso/action.yml'))).toBe(false)
    expect(existsSync(join(root, 'scripts/resolve-webpresso-cli-versions.js'))).toBe(false)
  })

  it('ignores absolute and repo-escaping generated cleanup paths', () => {
    const root = tempRepo()
    const outside = mkdtempSync(join(tmpdir(), 'wp-generated-cleanup-outside-'))
    tempDirs.push(outside)
    writeFileSync(join(outside, 'outside.txt'), 'keep me', 'utf8')

    const config = {
      ...defaultConfig(),
      generatedCleanup: {
        removePaths: ['/tmp/outside.txt', '../outside.txt'],
      },
    }

    expect(removeConfiguredGeneratedPaths(root, config)).toEqual([])
    expect(existsSync(join(outside, 'outside.txt'))).toBe(true)
  })
})
