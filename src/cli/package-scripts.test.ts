import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  getPackageScript,
  isRecursiveWpScript,
  packageHasDependency,
  packageUsesVitest,
} from './package-scripts.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe('package script helpers', () => {
  it('reads package scripts from the cwd package.json', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-package-scripts-'))
    tempDirs.push(cwd)
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ scripts: { test: 'wp test' } }),
      'utf8',
    )

    expect(getPackageScript(cwd, 'test')).toBe('wp test')
  })

  it('detects vitest as a package-local dependency', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-package-deps-'))
    tempDirs.push(cwd)
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^4.0.0' } }),
      'utf8',
    )

    expect(packageHasDependency(cwd, 'vitest')).toBe(true)
    expect(packageUsesVitest(cwd)).toBe(true)
  })

  it('detects recursive wp script invocations with optional env prefixes', () => {
    expect(isRecursiveWpScript('wp test', 'test')).toBe(true)
    expect(isRecursiveWpScript('WP_SKIP_UPDATE_CHECK=1 wp typecheck', 'typecheck')).toBe(true)
    expect(isRecursiveWpScript('env FOO=1 vp exec wp typecheck --pretty', 'typecheck')).toBe(true)
  })

  it('does not flag unrelated package scripts as recursive', () => {
    expect(isRecursiveWpScript('vitest run', 'test')).toBe(false)
    expect(isRecursiveWpScript('tsc --noEmit', 'typecheck')).toBe(false)
    expect(isRecursiveWpScript('wp lint', 'test')).toBe(false)
  })
})
