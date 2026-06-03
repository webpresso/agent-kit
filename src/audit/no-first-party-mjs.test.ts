import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  auditNoFirstPartyMjs,
  findTrackedFirstPartyMjsPaths,
  isIgnoredNoFirstPartyMjsPath,
} from './no-first-party-mjs.js'

const tempDirs: string[] = []

function tempDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-no-first-party-mjs-'))
  tempDirs.push(root)
  return root
}

function runGit(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function initRepo(root: string): void {
  runGit(root, 'init')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }, null, 2))
  runGit(root, 'add', 'package.json')
}

function track(root: string, relativePath: string, contents = ''): void {
  const fullPath = join(root, relativePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, contents)
  runGit(root, 'add', relativePath)
}

describe('no-first-party-mjs audit', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ignores generated and vendor paths', () => {
    expect(isIgnoredNoFirstPartyMjsPath('dist/tool.mjs')).toBe(true)
    expect(isIgnoredNoFirstPartyMjsPath('.webpresso/generated/tool.mjs')).toBe(true)
    expect(isIgnoredNoFirstPartyMjsPath('src/tool.mjs')).toBe(false)
  })

  it('filters tracked first-party .mjs paths from a tracked file list', () => {
    expect(
      findTrackedFirstPartyMjsPaths([
        'src/keep.ts',
        'src/bad.mjs',
        'dist/generated.mjs',
        '.webpresso/generated/cache.mjs',
      ]),
    ).toEqual(['src/bad.mjs'])
  })

  it('passes when the repo has no tracked first-party .mjs files', () => {
    const root = tempDir()
    initRepo(root)
    track(root, 'src/index.ts', 'export const ok = true\n')
    writeFileSync(join(root, 'scratch.mjs'), 'console.log("untracked")\n')

    const result = auditNoFirstPartyMjs(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('fails on tracked first-party .mjs files', () => {
    const root = tempDir()
    initRepo(root)
    track(root, 'src/bad.mjs', 'export {}\n')

    const result = auditNoFirstPartyMjs(root)
    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'src/bad.mjs',
        message: expect.stringContaining('rename this file to .ts'),
      }),
    ])
  })

  it('ignores tracked .mjs files under excluded generated directories', () => {
    const root = tempDir()
    initRepo(root)
    track(root, 'dist/generated.mjs', 'export {}\n')
    track(root, '.webpresso/generated/cache.mjs', 'export {}\n')

    const result = auditNoFirstPartyMjs(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('fails loudly when run outside a canonical repo root', () => {
    const umbrella = tempDir()
    const repo = join(umbrella, 'repo')
    mkdirSync(repo, { recursive: true })
    initRepo(repo)
    track(repo, 'src/index.ts', 'export const ok = true\n')

    const result = auditNoFirstPartyMjs(umbrella)
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain('canonical repo root')
  })

  it('fails loudly when run from a nested subdirectory of the repo', () => {
    const root = tempDir()
    initRepo(root)
    track(root, 'src/index.ts', 'export const ok = true\n')
    mkdirSync(join(root, 'src', 'nested'), { recursive: true })

    const result = auditNoFirstPartyMjs(join(root, 'src'))
    expect(result.ok).toBe(false)
    expect(result.violations[0]?.message).toContain(root)
  })
})
