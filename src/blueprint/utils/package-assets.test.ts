import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { resolvePackageAssetPreferred } from './package-assets.js'

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
})
