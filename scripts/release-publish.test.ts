import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('release-publish runtime lane', () => {
  it('builds, stages, and publishes platform runtime packages before the root package', () => {
    const source = readFileSync(join(import.meta.dirname, 'release-publish.ts'), 'utf8')

    expect(source.indexOf("['run', 'build']")).toBeLessThan(
      source.indexOf("['run', 'build:runtime-binaries']"),
    )
    expect(source.indexOf("['run', 'build:runtime-binaries']")).toBeLessThan(
      source.indexOf("['run', 'stage:plugin-runtime']"),
    )
    expect(source).toContain('for (const target of RUNTIME_TARGETS)')
    expect(source).toContain('resolve(runtimePackageRoot, runtimePackage)')
    expect(source.lastIndexOf("['publish', '--provenance', '--access', 'public']")).toBeGreaterThan(
      source.indexOf('for (const target of RUNTIME_TARGETS)'),
    )
  })
})
