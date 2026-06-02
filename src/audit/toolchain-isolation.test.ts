import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditToolchainIsolation } from './toolchain-isolation.js'

describe('auditToolchainIsolation', () => {
  let root: string

  beforeEach(() => {
    root = join(
      tmpdir(),
      `toolchain-isolation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects direct tool deps and direct binary scripts', () => {
    writePackage(root, {
      scripts: { test: 'vitest run', typecheck: 'wp typecheck' },
      devDependencies: { vitest: '^4.0.0', '@webpresso/agent-kit': 'latest' },
    })

    const result = auditToolchainIsolation(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((violation) => violation.message)).toEqual([
      expect.stringContaining('devDependencies.vitest'),
      expect.stringContaining('script "test"'),
    ])
  })

  it('allows wp and vp wrapper scripts without direct tool deps', () => {
    writePackage(root, {
      scripts: { test: 'wp test', qa: 'vp run qa' },
      devDependencies: { '@webpresso/agent-kit': 'latest' },
    })

    expect(auditToolchainIsolation(root)).toMatchObject({ ok: true, checked: 1 })
  })

  it('walks workspace package.json files while skipping node_modules', () => {
    mkdirSync(join(root, 'apps', 'client'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'vite'), { recursive: true })
    writePackage(root, { scripts: { lint: 'wp lint' } })
    writePackage(join(root, 'apps', 'client'), { devDependencies: { wrangler: '^4.0.0' } })
    writePackage(join(root, 'node_modules', 'vite'), { name: 'vite' })

    const result = auditToolchainIsolation(root)

    expect(result.checked).toBe(2)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain('devDependencies.wrangler')
  })

  // Regression: the audit walked gitignored agent scratch (.claude/worktrees/*)
  // and shipped skill templates under catalog/ (standalone app samples that
  // legitimately use vite/tsc directly — there is no wp equivalent for
  // dev/build/preview), producing false positives. Those are not the repo's
  // own wp-managed workspace packages, so the walk must skip them.
  it('skips gitignored agent scratch (.claude) and shipped content (catalog)', () => {
    writePackage(root, {
      scripts: { lint: 'wp lint' },
      devDependencies: { '@webpresso/agent-kit': 'latest' },
    })
    mkdirSync(join(root, '.claude', 'worktrees', 'agent-x'), { recursive: true })
    writePackage(join(root, '.claude', 'worktrees', 'agent-x'), {
      devDependencies: { typescript: '^6.0.0' },
    })
    mkdirSync(join(root, 'catalog', 'agent', 'skills', 'x', 'templates'), { recursive: true })
    writePackage(join(root, 'catalog', 'agent', 'skills', 'x', 'templates'), {
      scripts: { build: 'vite build' },
      devDependencies: { vite: '^8.0.0' },
    })

    const result = auditToolchainIsolation(root)

    expect(result).toMatchObject({ ok: true, checked: 1 })
  })
})

function writePackage(dir: string, value: unknown): void {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(value, null, 2)}\n`)
}
