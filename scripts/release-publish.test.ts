import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('release-publish runtime lane', () => {
  it('builds, stages, and publishes platform runtime packages before the root package', () => {
    const source = readFileSync(join(import.meta.dirname, 'release-publish.ts'), 'utf8')
    const rootPublishIndex = source.lastIndexOf("'publish'")

    expect(source.indexOf("['run', 'build']")).toBeLessThan(
      source.indexOf("['run', 'build:runtime-binaries']"),
    )
    expect(source.indexOf("['run', 'build:runtime-binaries']")).toBeLessThan(
      source.indexOf("['run', 'stage:plugin-runtime']"),
    )
    expect(source).toContain('for (const target of RUNTIME_TARGETS)')
    expect(source).toContain('resolve(runtimePackageRoot, runtimePackage)')
    expect(rootPublishIndex).toBeGreaterThan(source.indexOf('for (const target of RUNTIME_TARGETS)'))
  })

  it('explicitly prepares and restores the packed root manifest around root publish', () => {
    const source = readFileSync(join(import.meta.dirname, 'release-publish.ts'), 'utf8')
    const rootPublishIndex = source.lastIndexOf("'publish'")

    expect(source).toContain('preparePackedManifest(packageRoot)')
    expect(source).toContain('restorePackedManifest(packageRoot)')
    expect(source.indexOf('preparePackedManifest(packageRoot)')).toBeLessThan(rootPublishIndex)
    expect(source.indexOf('restorePackedManifest(packageRoot)')).toBeGreaterThan(
      rootPublishIndex,
    )
    expect(source).toContain("'--ignore-scripts'")
  })
})
