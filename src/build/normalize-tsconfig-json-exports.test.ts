import { describe, expect, it } from 'vitest'

import { normalizeTsconfigJsonExports } from './normalize-tsconfig-json-exports.js'

describe('normalizeTsconfigJsonExports', () => {
  it('adds top-level defaults and strips nested types from tsconfig json exports', () => {
    const manifest = {
      exports: {
        './tsconfig/base.json': {
          import: {
            types: './tsconfig/base.json',
            default: './tsconfig/base.json',
          },
        },
        './vitest/node': {
          import: {
            types: './dist/esm/config/vitest/node.d.ts',
            default: './dist/esm/config/vitest/node.js',
          },
        },
      },
    }

    expect(normalizeTsconfigJsonExports(manifest)).toEqual({
      exports: {
        './tsconfig/base.json': {
          import: {
            default: './tsconfig/base.json',
          },
          default: './tsconfig/base.json',
        },
        './vitest/node': {
          import: {
            types: './dist/esm/config/vitest/node.d.ts',
            default: './dist/esm/config/vitest/node.js',
          },
        },
      },
    })
  })

  it('strips stale nested types even when the top-level default already exists', () => {
    const manifest = {
      exports: {
        './tsconfig/cloudflare.json': {
          import: {
            types: './tsconfig/cloudflare.json',
            default: './tsconfig/cloudflare.json',
          },
          default: './tsconfig/cloudflare.json',
        },
      },
    }

    expect(normalizeTsconfigJsonExports(manifest)).toEqual({
      exports: {
        './tsconfig/cloudflare.json': {
          import: {
            default: './tsconfig/cloudflare.json',
          },
          default: './tsconfig/cloudflare.json',
        },
      },
    })
  })
})
