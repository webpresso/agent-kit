import { existsSync } from 'node:fs'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findPackageAsset, resolvePackageAssetPreferred } from './package-assets.js'

describe('resolvePackageAssetPreferred', () => {
  it('returns the first existing candidate — the source docs/ path wins in a checkout', () => {
    const resolved = resolvePackageAssetPreferred([
      'docs/templates/blueprint.md',
      'catalog/docs/templates/blueprint.md',
    ])
    expect(existsSync(resolved)).toBe(true)
    expect(resolved.endsWith('docs/templates/blueprint.md')).toBe(true)
    expect(resolved.includes(`${'catalog'}/docs/templates/`)).toBe(false)
  })

  it('falls back to the shipped catalog/ path when the docs/ primary is absent', () => {
    // Models the published tarball, where only catalog/ ships (no repo-root docs/).
    const resolved = resolvePackageAssetPreferred([
      'docs/templates/__definitely-missing__.md',
      'catalog/docs/templates/blueprint.md',
    ])
    expect(existsSync(resolved)).toBe(true)
    expect(resolved.endsWith('catalog/docs/templates/blueprint.md')).toBe(true)
  })

  it('throws when given no candidates', () => {
    expect(() => resolvePackageAssetPreferred([])).toThrow(/at least one candidate/u)
  })

  it('ignores Bun single-file virtual module paths and resolves from the invoked package', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-package-assets-'))
    mkdirSync(join(root, 'catalog', 'agent'), { recursive: true })
    writeFileSync(join(root, 'catalog', 'agent', 'marker.txt'), 'ok\n')
    mkdirSync(join(root, 'bin'), { recursive: true })
    writeFileSync(join(root, 'bin', 'wp'), '')

    const resolved = findPackageAsset('catalog/agent', {
      moduleUrl: 'file:///$bunfs/root/blueprint/utils/package-assets.js',
      argv0: '/$bunfs/root/wp',
      argv1: '/$bunfs/root/wp',
      execPath: join(root, 'bin', 'wp'),
      cwd: join(root, 'consumer'),
    })

    expect(resolved).toBe(join(root, 'catalog', 'agent'))
  })
})
