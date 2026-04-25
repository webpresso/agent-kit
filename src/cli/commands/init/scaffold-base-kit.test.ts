import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveCatalogDir } from './index.js'
import { scaffoldBaseKit } from './scaffold-base-kit.js'

describe('scaffoldBaseKit', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = join(tmpdir(), `ak-base-kit-test-${Date.now()}`)
    mkdirSync(repoRoot, { recursive: true })
  })

  it('writes all expected template files', () => {
    const catalogDir = resolveCatalogDir()
    const results = scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const actions = results.map((r) => r.action)
    expect(actions).not.toContain('skipped-dry')

    expect(existsSync(join(repoRoot, '.gitignore'))).toBe(true)
    expect(existsSync(join(repoRoot, '.editorconfig'))).toBe(true)
    expect(existsSync(join(repoRoot, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(repoRoot, '.secretlintrc.json'))).toBe(true)
    expect(existsSync(join(repoRoot, 'commitlint.config.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, '.husky', 'pre-commit'))).toBe(true)
    expect(existsSync(join(repoRoot, '.husky', 'commit-msg'))).toBe(true)
    expect(existsSync(join(repoRoot, '.github', 'workflows', 'ci.webpresso.yml'))).toBe(true)
  })

  it('dry-run does not write files', () => {
    const catalogDir = resolveCatalogDir()
    const results = scaffoldBaseKit({ catalogDir, repoRoot, options: { dryRun: true } })

    const actions = results.map((r) => r.action)
    expect(actions.every((a) => a === 'skipped-dry')).toBe(true)
    expect(existsSync(join(repoRoot, '.gitignore'))).toBe(false)
  })

  it('merges engines and packageManager into package.json', () => {
    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as Record<string, unknown>
    expect((pkg['engines'] as Record<string, string>)['node']).toBe('>=24')
    expect(pkg['packageManager']).toBe('pnpm@10.33.0')
  })

  it('identical run produces only identical/skipped results', () => {
    const catalogDir = resolveCatalogDir()
    scaffoldBaseKit({ catalogDir, repoRoot, options: {} })
    const results2 = scaffoldBaseKit({ catalogDir, repoRoot, options: {} })

    const nonIdentical = results2.filter((r) => r.action !== 'identical')
    expect(nonIdentical).toHaveLength(0)
  })
})
