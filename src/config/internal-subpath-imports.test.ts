import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createVitestAliasEntriesFromPackageImports,
  readCanonicalPackageImports,
  resolveVitestAliasSpecifier,
} from './internal-subpath-imports.js'

describe('internal subpath imports', () => {
  it('derives Vitest aliases from package.json imports with specific patterns before catch-alls', () => {
    const aliases = createVitestAliasEntriesFromPackageImports(readCanonicalPackageImports())

    expect(resolveVitestAliasSpecifier('#launcher/root-contract.js', aliases)).toBe(
      resolve(process.cwd(), 'src/launcher/root-contract.ts'),
    )
    expect(resolveVitestAliasSpecifier('#utils/blueprint-root', aliases)).toBe(
      resolve(process.cwd(), 'src/blueprint/utils/blueprint-root.ts'),
    )
    expect(resolveVitestAliasSpecifier('#sync/client.js', aliases)).toBe(
      resolve(process.cwd(), 'src/blueprint/sync/client.ts'),
    )
    expect(resolveVitestAliasSpecifier('#tool-runtime', aliases)).toBe(
      resolve(process.cwd(), 'src/tool-runtime/index.ts'),
    )
    expect(resolveVitestAliasSpecifier('#codex/app-server/client.js', aliases)).toBe(
      resolve(process.cwd(), 'src/codex/app-server/client.ts'),
    )
  })
})
