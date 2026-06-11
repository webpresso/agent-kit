import { describe, expect, it } from 'vitest'

import { sanitizeNestedPackageJson } from './sanitize-dist-package-json.ts'

describe('sanitizeNestedPackageJson', () => {
  it('removes imports from nested dist package manifests', () => {
    const sanitized = sanitizeNestedPackageJson({
      type: 'module',
      imports: {
        '#foo': './foo.js',
      },
      exports: {
        '.': './index.js',
      },
    })

    expect(sanitized).toEqual({
      type: 'module',
      exports: {
        '.': './index.js',
      },
    })
  })

  it('preserves manifests that already have no imports field', () => {
    const sanitized = sanitizeNestedPackageJson({
      type: 'module',
      exports: {
        '.': './index.js',
      },
    })

    expect(sanitized).toEqual({
      type: 'module',
      exports: {
        '.': './index.js',
      },
    })
  })
})
