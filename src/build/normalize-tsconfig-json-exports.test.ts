import { describe, expect, it } from 'vitest'

import { normalizeTsconfigJsonExports } from './normalize-tsconfig-json-exports.js'

describe('normalizeTsconfigJsonExports', () => {
  it('adds top-level defaults for tsconfig json exports and leaves other exports unchanged', () => {
    const manifest = {
      exports: {
        './tsconfig/base.json': {
          import: {
            types: './dist/esm/config/tsconfig/base.json',
            default: './dist/esm/config/tsconfig/base.json',
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
            types: './dist/esm/config/tsconfig/base.json',
            default: './dist/esm/config/tsconfig/base.json',
          },
          default: './dist/esm/config/tsconfig/base.json',
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
})
