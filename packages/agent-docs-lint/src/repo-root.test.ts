import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { findRepoRoot, REPO_ROOT_MARKER } from './repo-root'

describe('findRepoRoot', () => {
  it('should find the repo root from the current working directory', () => {
    const root = findRepoRoot()
    expect(root).not.toBe('')
    expect(typeof root).toBe('string')
  })

  it('should find the repo root when starting from a nested directory', () => {
    const nested = join(process.cwd(), 'packages', 'foundation', 'docs-linter', 'src')
    const root = findRepoRoot(nested)
    expect(root).not.toBe('')
  })

  it('should return a directory containing pnpm-workspace.yaml', () => {
    const root = findRepoRoot()
    expect(existsSync(join(root, REPO_ROOT_MARKER))).toBe(true)
  })

  it('should throw when no marker file is found', () => {
    const tmpDir = '/tmp'
    expect(() => findRepoRoot(tmpDir)).toThrow(REPO_ROOT_MARKER)
  })

  it('should find root from a temp directory nested inside the repo', () => {
    const tmpInRepo = join(process.cwd(), 'packages', 'foundation', 'docs-linter', '__tmp_test_dir__')
    mkdirSync(tmpInRepo, { recursive: true })
    try {
      const root = findRepoRoot(tmpInRepo)
      expect(root).not.toBe('')
      expect(existsSync(join(root, REPO_ROOT_MARKER))).toBe(true)
    } finally {
      rmSync(tmpInRepo, { recursive: true, force: true })
    }
  })
})
