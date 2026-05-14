import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  restoreCanonicalPackageJsonExports,
  restoreDirectTsconfigExports,
} from './restore-direct-tsconfig-exports.js'

describe('restoreDirectTsconfigExports', () => {
  it('forces the public webpresso tsconfig exports back to direct json targets', () => {
    expect(
      restoreDirectTsconfigExports({
        exports: {
          './tsconfig/webpresso.json': {
            import: {
              types: './dist/esm/config/tsconfig/webpresso.json',
              default: './dist/esm/config/tsconfig/webpresso.json',
            },
          },
          './tsconfig/webpresso': {
            import: {
              types: './dist/esm/config/tsconfig/webpresso.json',
              default: './dist/esm/config/tsconfig/webpresso.json',
            },
          },
        },
      }),
    ).toEqual({
      exports: {
        './tsconfig/webpresso.json': './tsconfig/webpresso.json',
        './tsconfig/webpresso': './tsconfig/webpresso.json',
      },
    })
  })
})

describe('restoreCanonicalPackageJsonExports', () => {
  it('rewrites an on-disk package.json back to direct webpresso tsconfig exports', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'restore-direct-tsconfig-exports-'))
    const packageJsonPath = join(tempDir, 'package.json')

    await writeFile(
      packageJsonPath,
      JSON.stringify(
        {
          name: 'fixture',
          exports: {
            './tsconfig/webpresso.json': {
              import: {
                types: './dist/esm/config/tsconfig/webpresso.json',
                default: './dist/esm/config/tsconfig/webpresso.json',
              },
            },
            './tsconfig/webpresso': {
              import: {
                types: './dist/esm/config/tsconfig/webpresso.json',
                default: './dist/esm/config/tsconfig/webpresso.json',
              },
            },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )

    restoreCanonicalPackageJsonExports(packageJsonPath)

    expect(JSON.parse(await readFile(packageJsonPath, 'utf8'))).toMatchObject({
      exports: {
        './tsconfig/webpresso.json': './tsconfig/webpresso.json',
        './tsconfig/webpresso': './tsconfig/webpresso.json',
      },
    })
  })
})
