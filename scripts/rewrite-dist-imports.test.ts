import { describe, expect, it } from 'vitest'

import {
  buildImportResolver,
  rewriteBuiltModuleSpecifiers,
  toBuiltModulePath,
} from './rewrite-dist-imports.ts'

describe('toBuiltModulePath', () => {
  it('maps source ts modules to built js modules', () => {
    expect(toBuiltModulePath('./src/blueprint/core/schema.ts')).toBe('dist/esm/blueprint/core/schema.js')
  })

  it('preserves json assets in dist', () => {
    expect(toBuiltModulePath('./src/config/tsconfig/base.json')).toBe('dist/esm/config/tsconfig/base.json')
  })
})

describe('buildImportResolver', () => {
  const resolveSpecifier = buildImportResolver({
    '#paths/*': './src/paths/*.ts',
    '#paths/*.js': './src/paths/*.ts',
    '#runners': './src/runners/index.ts',
    '#*': './src/blueprint/*.ts',
  })

  it('resolves exact aliases', () => {
    expect(resolveSpecifier('#runners')).toBe('dist/esm/runners/index.js')
  })

  it('resolves wildcard aliases with js suffixes', () => {
    expect(resolveSpecifier('#paths/state-root.js')).toBe('dist/esm/paths/state-root.js')
  })

  it('falls back to the catch-all blueprint mapping', () => {
    expect(resolveSpecifier('#core/schema')).toBe('dist/esm/blueprint/core/schema.js')
  })
})

describe('rewriteBuiltModuleSpecifiers', () => {
  const resolveSpecifier = buildImportResolver({
    '#paths/*': './src/paths/*.ts',
    '#paths/*.js': './src/paths/*.ts',
    '#runners': './src/runners/index.ts',
    '#*': './src/blueprint/*.ts',
  })

  it('rewrites static imports, exports, and dynamic imports to relative built paths', () => {
    const rewritten = rewriteBuiltModuleSpecifiers(
      'dist/esm/cli/bootstrap.js',
      [
        "import { NotInGitRepoError } from '#paths/state-root.js';",
        "export { parseBlueprint } from '#core/parser';",
        "const mod = await import('#runners');",
      ].join('\n'),
      resolveSpecifier,
    )

    expect(rewritten).toContain("from '../paths/state-root.js'")
    expect(rewritten).toContain("from '../blueprint/core/parser.js'")
    expect(rewritten).toContain("import('../runners/index.js')")
    expect(rewritten).not.toContain("'#")
  })

  it('rewrites declaration imports to js specifiers so TypeScript can follow package-relative ESM paths', () => {
    const rewritten = rewriteBuiltModuleSpecifiers(
      'dist/esm/blueprint/core/parser.d.ts',
      "import type { BlueprintTaskStatus } from '#core/schema';",
      resolveSpecifier,
    )

    expect(rewritten).toBe("import type { BlueprintTaskStatus } from './schema.js';")
  })
})
