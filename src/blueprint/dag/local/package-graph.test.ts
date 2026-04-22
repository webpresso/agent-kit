import { describe, expect, it } from 'vitest'

import { createMockFileSystem, PackageGraph } from './package-graph'

const ROOT = '/repo'

/**
 * Helper: build a mock filesystem from a flat record.
 * Keys are paths relative to ROOT; values are file contents (or null for absence).
 */
function buildFs(entries: Record<string, string | null>): ReturnType<typeof createMockFileSystem> {
  const files = new Map<string, string | null>()
  for (const [key, value] of Object.entries(entries)) {
    files.set(key, value)
  }
  return createMockFileSystem(files)
}

function pkgJson(name: string, deps?: Record<string, string>, devDeps?: Record<string, string>) {
  return JSON.stringify({
    name,
    ...(deps ? { dependencies: deps } : {}),
    ...(devDeps ? { devDependencies: devDeps } : {}),
  })
}

describe('PackageGraph', () => {
  // ---------------------------------------------------------------------------
  // findPackageRoot
  // ---------------------------------------------------------------------------
  describe('findPackageRoot', () => {
    it('finds package.json in the immediate parent directory', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.findPackageRoot('packages/foo/src/index.ts')).toBe('packages/foo')
    })

    it('finds package.json two levels up', () => {
      const fs = buildFs({
        [`${ROOT}/packages/bar/package.json`]: pkgJson('@scope/bar'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.findPackageRoot('packages/bar/src/deep/nested/file.ts')).toBe('packages/bar')
    })

    it('finds the closest package.json when nested packages exist', () => {
      const fs = buildFs({
        [`${ROOT}/packages/outer/package.json`]: pkgJson('@scope/outer'),
        [`${ROOT}/packages/outer/packages/inner/package.json`]: pkgJson('@scope/inner'),
      })
      const graph = new PackageGraph(ROOT, fs)

      // File inside inner should resolve to inner, not outer
      expect(graph.findPackageRoot('packages/outer/packages/inner/src/index.ts')).toBe(
        'packages/outer/packages/inner',
      )
      // File inside outer (but not inner) should resolve to outer
      expect(graph.findPackageRoot('packages/outer/src/index.ts')).toBe('packages/outer')
    })

    it('returns null when no package.json exists anywhere', () => {
      const fs = buildFs({})
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.findPackageRoot('some/random/file.ts')).toBeNull()
    })

    it('finds root-level package.json', () => {
      const fs = buildFs({
        [`${ROOT}/package.json`]: pkgJson('root-project'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.findPackageRoot('src/index.ts')).toBe('')
    })

    it('finds package.json at the exact file directory', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const graph = new PackageGraph(ROOT, fs)

      // File directly inside the package directory (not a subdirectory)
      expect(graph.findPackageRoot('packages/foo/index.ts')).toBe('packages/foo')
    })
  })

  // ---------------------------------------------------------------------------
  // getPackageName
  // ---------------------------------------------------------------------------
  describe('getPackageName', () => {
    it('returns the name field from package.json', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.getPackageName('packages/foo')).toBe('@scope/foo')
    })

    it('returns null when package.json does not exist', () => {
      const fs = buildFs({})
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.getPackageName('packages/nonexistent')).toBeNull()
    })

    it('returns null when package.json contains invalid JSON', () => {
      const fs = buildFs({
        [`${ROOT}/packages/broken/package.json`]: '{not valid json',
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.getPackageName('packages/broken')).toBeNull()
    })

    it('returns null when package.json has no name field', () => {
      const fs = buildFs({
        [`${ROOT}/packages/noname/package.json`]: JSON.stringify({ version: '1.0.0' }),
      })
      const graph = new PackageGraph(ROOT, fs)

      // name is undefined, and `pkgJson?.name ?? null` coalesces to null
      expect(graph.getPackageName('packages/noname')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // hasCrossPackageDependency
  // ---------------------------------------------------------------------------
  describe('hasCrossPackageDependency', () => {
    it('returns true when A depends on B via dependencies', () => {
      const fs = buildFs({
        [`${ROOT}/packages/app/package.json`]: pkgJson('@scope/app', {
          '@scope/lib': '^1.0.0',
        }),
        [`${ROOT}/packages/lib/package.json`]: pkgJson('@scope/lib'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.hasCrossPackageDependency('packages/app', 'packages/lib')).toBe(true)
    })

    it('returns true when A depends on B via devDependencies', () => {
      const fs = buildFs({
        [`${ROOT}/packages/app/package.json`]: pkgJson(
          '@scope/app',
          {},
          { '@scope/testing-utils': 'workspace:*' },
        ),
        [`${ROOT}/packages/testing-utils/package.json`]: pkgJson('@scope/testing-utils'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.hasCrossPackageDependency('packages/app', 'packages/testing-utils')).toBe(true)
    })

    it('returns false when A does not depend on B', () => {
      const fs = buildFs({
        [`${ROOT}/packages/app/package.json`]: pkgJson('@scope/app', {
          lodash: '^4.0.0',
        }),
        [`${ROOT}/packages/lib/package.json`]: pkgJson('@scope/lib'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.hasCrossPackageDependency('packages/app', 'packages/lib')).toBe(false)
    })

    it('is directional: A depends on B does not mean B depends on A', () => {
      const fs = buildFs({
        [`${ROOT}/packages/app/package.json`]: pkgJson('@scope/app', {
          '@scope/lib': '^1.0.0',
        }),
        [`${ROOT}/packages/lib/package.json`]: pkgJson('@scope/lib'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.hasCrossPackageDependency('packages/app', 'packages/lib')).toBe(true)
      expect(graph.hasCrossPackageDependency('packages/lib', 'packages/app')).toBe(false)
    })

    it('returns false when package A does not exist', () => {
      const fs = buildFs({
        [`${ROOT}/packages/lib/package.json`]: pkgJson('@scope/lib'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.hasCrossPackageDependency('packages/ghost', 'packages/lib')).toBe(false)
    })

    it('returns false when package B does not exist', () => {
      const fs = buildFs({
        [`${ROOT}/packages/app/package.json`]: pkgJson('@scope/app'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.hasCrossPackageDependency('packages/app', 'packages/ghost')).toBe(false)
    })

    it('returns false when neither package exists', () => {
      const fs = buildFs({})
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.hasCrossPackageDependency('packages/a', 'packages/b')).toBe(false)
    })

    it('handles packages with no dependencies at all', () => {
      const fs = buildFs({
        [`${ROOT}/packages/app/package.json`]: pkgJson('@scope/app'),
        [`${ROOT}/packages/lib/package.json`]: pkgJson('@scope/lib'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.hasCrossPackageDependency('packages/app', 'packages/lib')).toBe(false)
    })

    it('detects dependency when both deps and devDeps exist', () => {
      const fs = buildFs({
        [`${ROOT}/packages/app/package.json`]: pkgJson(
          '@scope/app',
          { react: '^18.0.0' },
          { '@scope/lib': 'workspace:*' },
        ),
        [`${ROOT}/packages/lib/package.json`]: pkgJson('@scope/lib'),
      })
      const graph = new PackageGraph(ROOT, fs)

      // lib is only in devDeps, but should still be found via the spread merge
      expect(graph.hasCrossPackageDependency('packages/app', 'packages/lib')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // areInSamePackage
  // ---------------------------------------------------------------------------
  describe('areInSamePackage', () => {
    it('returns true when both files are in the same package', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.areInSamePackage('packages/foo/src/a.ts', 'packages/foo/src/utils/b.ts')).toBe(
        true,
      )
    })

    it('returns false when files are in different packages', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
        [`${ROOT}/packages/bar/package.json`]: pkgJson('@scope/bar'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.areInSamePackage('packages/foo/src/a.ts', 'packages/bar/src/b.ts')).toBe(false)
    })

    it('returns false when one file has no package root', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.areInSamePackage('packages/foo/src/a.ts', 'orphan/file.ts')).toBe(false)
    })

    it('returns false when neither file has a package root', () => {
      const fs = buildFs({})
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.areInSamePackage('a/file.ts', 'b/file.ts')).toBe(false)
    })

    it('returns true for files at different depths within the same package', () => {
      const fs = buildFs({
        [`${ROOT}/packages/deep/package.json`]: pkgJson('@scope/deep'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(
        graph.areInSamePackage(
          'packages/deep/index.ts',
          'packages/deep/src/very/deeply/nested/file.ts',
        ),
      ).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Caching
  // ---------------------------------------------------------------------------
  describe('caching', () => {
    it('returns cached result on second call to findPackageRoot', () => {
      let callCount = 0
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      // Wrap existsSync to count calls
      const original = fs.existsSync
      fs.existsSync = (path: string) => {
        callCount++
        return original(path)
      }

      const graph = new PackageGraph(ROOT, fs)

      // First call should invoke existsSync
      const result1 = graph.findPackageRoot('packages/foo/src/index.ts')
      const countAfterFirst = callCount

      // Second call should hit cache - no new existsSync calls
      const result2 = graph.findPackageRoot('packages/foo/src/index.ts')
      const countAfterSecond = callCount

      expect(result1).toBe('packages/foo')
      expect(result2).toBe('packages/foo')
      expect(countAfterSecond).toBe(countAfterFirst) // no extra calls
    })

    it('caches null results too (missing package.json)', () => {
      let callCount = 0
      const fs = buildFs({})
      const original = fs.existsSync
      fs.existsSync = (path: string) => {
        callCount++
        return original(path)
      }

      const graph = new PackageGraph(ROOT, fs)

      const result1 = graph.findPackageRoot('no/package/here.ts')
      const countAfterFirst = callCount

      const result2 = graph.findPackageRoot('no/package/here.ts')
      const countAfterSecond = callCount

      expect(result1).toBeNull()
      expect(result2).toBeNull()
      expect(countAfterSecond).toBe(countAfterFirst)
    })

    it('caches loadPackageJson results for getPackageName', () => {
      let readCount = 0
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const originalRead = fs.readFileSync
      fs.readFileSync = (path: string, encoding: 'utf-8') => {
        readCount++
        return originalRead(path, encoding)
      }

      const graph = new PackageGraph(ROOT, fs)

      graph.getPackageName('packages/foo')
      const countAfterFirst = readCount
      graph.getPackageName('packages/foo')
      const countAfterSecond = readCount

      expect(countAfterSecond).toBe(countAfterFirst)
    })

    it('getCachedPackageRoots returns discovered packages', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
        [`${ROOT}/packages/bar/package.json`]: pkgJson('@scope/bar'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.getCachedPackageRoots()).toEqual([])

      graph.findPackageRoot('packages/foo/src/a.ts')
      expect(graph.getCachedPackageRoots()).toEqual(['packages/foo'])

      graph.findPackageRoot('packages/bar/src/b.ts')
      expect(graph.getCachedPackageRoots()).toContain('packages/foo')
      expect(graph.getCachedPackageRoots()).toContain('packages/bar')
      expect(graph.getCachedPackageRoots()).toHaveLength(2)
    })

    it('getCachedPackageRoots excludes null entries', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const graph = new PackageGraph(ROOT, fs)

      graph.findPackageRoot('packages/foo/src/a.ts')
      graph.findPackageRoot('orphan/file.ts') // will be cached as null

      expect(graph.getCachedPackageRoots()).toEqual(['packages/foo'])
    })
  })

  // ---------------------------------------------------------------------------
  // clearCache
  // ---------------------------------------------------------------------------
  describe('clearCache', () => {
    it('empties all cached data so subsequent calls re-read the filesystem', () => {
      let callCount = 0
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const original = fs.existsSync
      fs.existsSync = (path: string) => {
        callCount++
        return original(path)
      }

      const graph = new PackageGraph(ROOT, fs)

      graph.findPackageRoot('packages/foo/src/a.ts')
      const countAfterFirst = callCount

      graph.clearCache()

      graph.findPackageRoot('packages/foo/src/a.ts')
      const countAfterSecondAfterClear = callCount

      // Should have made new filesystem calls after cache clear
      expect(countAfterSecondAfterClear).toBeGreaterThan(countAfterFirst)
    })

    it('clears getCachedPackageRoots', () => {
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const graph = new PackageGraph(ROOT, fs)

      graph.findPackageRoot('packages/foo/src/a.ts')
      expect(graph.getCachedPackageRoots()).toHaveLength(1)

      graph.clearCache()
      expect(graph.getCachedPackageRoots()).toEqual([])
    })

    it('clears packageJson cache so getPackageName re-reads', () => {
      let readCount = 0
      const fs = buildFs({
        [`${ROOT}/packages/foo/package.json`]: pkgJson('@scope/foo'),
      })
      const originalRead = fs.readFileSync
      fs.readFileSync = (path: string, encoding: 'utf-8') => {
        readCount++
        return originalRead(path, encoding)
      }

      const graph = new PackageGraph(ROOT, fs)

      graph.getPackageName('packages/foo')
      expect(readCount).toBe(1)

      graph.getPackageName('packages/foo')
      expect(readCount).toBe(1) // cached

      graph.clearCache()
      graph.getPackageName('packages/foo')
      expect(readCount).toBe(2) // re-read after clear
    })
  })

  // ---------------------------------------------------------------------------
  // createMockFileSystem
  // ---------------------------------------------------------------------------
  describe('createMockFileSystem', () => {
    it('existsSync returns true for present files', () => {
      const files = new Map<string, string | null>([['/a/b.json', '{}']])
      const fs = createMockFileSystem(files)
      expect(fs.existsSync('/a/b.json')).toBe(true)
    })

    it('existsSync returns false for missing files', () => {
      const files = new Map<string, string | null>()
      const fs = createMockFileSystem(files)
      expect(fs.existsSync('/nope')).toBe(false)
    })

    it('existsSync returns false for entries set to null', () => {
      const files = new Map<string, string | null>([['/a/b.json', null]])
      const fs = createMockFileSystem(files)
      expect(fs.existsSync('/a/b.json')).toBe(false)
    })

    it('readFileSync returns file contents', () => {
      const files = new Map<string, string | null>([['/a/b.json', '{"hello": true}']])
      const fs = createMockFileSystem(files)
      expect(fs.readFileSync('/a/b.json', 'utf-8')).toBe('{"hello": true}')
    })

    it('readFileSync throws for missing files', () => {
      const files = new Map<string, string | null>()
      const fs = createMockFileSystem(files)
      expect(() => fs.readFileSync('/missing', 'utf-8')).toThrow('ENOENT')
    })

    it('readFileSync throws for null entries', () => {
      const files = new Map<string, string | null>([['/a/b.json', null]])
      const fs = createMockFileSystem(files)
      expect(() => fs.readFileSync('/a/b.json', 'utf-8')).toThrow('ENOENT')
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases and integration scenarios
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles package.json that throws on read (readFileSync error)', () => {
      const files = new Map<string, string | null>()
      const fs = createMockFileSystem(files)
      // Override to simulate an unexpected read error for an existing file
      fs.existsSync = (path: string) => path.endsWith('package.json')
      fs.readFileSync = () => {
        throw new Error('Permission denied')
      }

      const graph = new PackageGraph(ROOT, fs)

      // loadPackageJson catches the error and returns null
      expect(graph.getPackageName('packages/foo')).toBeNull()
    })

    it('handles empty package.json (valid JSON but empty object)', () => {
      const fs = buildFs({
        [`${ROOT}/packages/empty/package.json`]: '{}',
      })
      const graph = new PackageGraph(ROOT, fs)

      // name is undefined in the parsed JSON, ?? null coalesces to null
      expect(graph.getPackageName('packages/empty')).toBeNull()
    })

    it('handles package.json with empty string name', () => {
      const fs = buildFs({
        [`${ROOT}/packages/unnamed/package.json`]: JSON.stringify({ name: '' }),
      })
      const graph = new PackageGraph(ROOT, fs)

      // Empty string is falsy but still a string value returned by getPackageName
      expect(graph.getPackageName('packages/unnamed')).toBe('')
    })

    it('full integration: multi-package monorepo scenario', () => {
      const fs = buildFs({
        [`${ROOT}/package.json`]: pkgJson('monorepo-root'),
        [`${ROOT}/packages/core/package.json`]: pkgJson('@scope/core'),
        [`${ROOT}/packages/utils/package.json`]: pkgJson('@scope/utils'),
        [`${ROOT}/packages/app/package.json`]: pkgJson(
          '@scope/app',
          { '@scope/core': 'workspace:*', '@scope/utils': 'workspace:*' },
          {},
        ),
        [`${ROOT}/packages/tests/package.json`]: pkgJson(
          '@scope/tests',
          {},
          { '@scope/app': 'workspace:*' },
        ),
      })
      const graph = new PackageGraph(ROOT, fs)

      // File-to-package resolution
      expect(graph.findPackageRoot('packages/core/src/index.ts')).toBe('packages/core')
      expect(graph.findPackageRoot('packages/app/src/main.ts')).toBe('packages/app')

      // Package names
      expect(graph.getPackageName('packages/core')).toBe('@scope/core')
      expect(graph.getPackageName('packages/app')).toBe('@scope/app')

      // Same package check
      expect(graph.areInSamePackage('packages/core/src/a.ts', 'packages/core/src/b.ts')).toBe(true)
      expect(graph.areInSamePackage('packages/core/src/a.ts', 'packages/app/src/b.ts')).toBe(false)

      // Dependencies: app depends on core and utils
      expect(graph.hasCrossPackageDependency('packages/app', 'packages/core')).toBe(true)
      expect(graph.hasCrossPackageDependency('packages/app', 'packages/utils')).toBe(true)

      // Reverse: core does not depend on app
      expect(graph.hasCrossPackageDependency('packages/core', 'packages/app')).toBe(false)

      // tests devDepends on app
      expect(graph.hasCrossPackageDependency('packages/tests', 'packages/app')).toBe(true)

      // core and utils are independent
      expect(graph.hasCrossPackageDependency('packages/core', 'packages/utils')).toBe(false)
      expect(graph.hasCrossPackageDependency('packages/utils', 'packages/core')).toBe(false)
    })

    it('root-level files resolve to root package', () => {
      const fs = buildFs({
        [`${ROOT}/package.json`]: pkgJson('root'),
      })
      const graph = new PackageGraph(ROOT, fs)

      expect(graph.findPackageRoot('tsconfig.json')).toBe('')
      expect(graph.findPackageRoot('scripts/deploy.sh')).toBe('')
    })

    it('hasCrossPackageDependency with invalid JSON in one package', () => {
      const fs = buildFs({
        [`${ROOT}/packages/good/package.json`]: pkgJson('@scope/good', {
          '@scope/bad': '^1.0.0',
        }),
        [`${ROOT}/packages/bad/package.json`]: 'not json!',
      })
      const graph = new PackageGraph(ROOT, fs)

      // pkgB is null due to invalid JSON, so returns false
      expect(graph.hasCrossPackageDependency('packages/good', 'packages/bad')).toBe(false)
    })
  })
})
