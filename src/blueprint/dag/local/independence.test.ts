import { describe, expect, it } from 'vitest'

import { createMockPackageGraph, IndependenceDetector, type TaskFiles } from './independence.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand for creating a TaskFiles object. */
function task(id: string, files: string[], readOnly = false): TaskFiles {
  return { id, files, readOnly }
}

/**
 * Build a standard two-package workspace graph for many tests.
 *
 * packages/alpha  contains  alpha/src/a.ts, alpha/src/b.ts
 * packages/beta   contains  beta/src/c.ts, beta/src/d.ts
 *
 * No cross-package dependencies by default.
 */
function twoPackageGraph(dependencies?: Map<string, string[]>) {
  const packages = new Map<string, string | null>([
    ['alpha/src/a.ts', 'packages/alpha'],
    ['alpha/src/b.ts', 'packages/alpha'],
    ['beta/src/c.ts', 'packages/beta'],
    ['beta/src/d.ts', 'packages/beta'],
  ])
  return createMockPackageGraph(packages, dependencies)
}

// ===========================================================================
// canParallelize
// ===========================================================================

describe('IndependenceDetector', () => {
  describe('canParallelize', () => {
    // -----------------------------------------------------------------------
    // 1. Empty files → PARALLEL
    // -----------------------------------------------------------------------
    describe('empty files', () => {
      it('returns PARALLEL when taskA has no files', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(task('a', []), task('b', ['beta/src/c.ts']))
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('no files')
      })

      it('returns PARALLEL when taskB has no files', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(task('a', ['alpha/src/a.ts']), task('b', []))
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('no files')
      })

      it('returns PARALLEL when both tasks have no files', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(task('a', []), task('b', []))
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('no files')
      })
    })

    // -----------------------------------------------------------------------
    // 2. Different packages, no cross-dep → PARALLEL
    // -----------------------------------------------------------------------
    describe('different packages, no cross-dependency', () => {
      it('returns PARALLEL for tasks in separate packages without deps', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts']),
          task('b', ['beta/src/c.ts']),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('different packages')
      })

      it('returns PARALLEL for tasks with multiple files in separate packages', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts', 'alpha/src/b.ts']),
          task('b', ['beta/src/c.ts', 'beta/src/d.ts']),
        )
        expect(result.canParallelize).toBe(true)
      })
    })

    // -----------------------------------------------------------------------
    // 3. Same package, no file overlap → PARALLEL
    // -----------------------------------------------------------------------
    describe('same package, no file overlap', () => {
      it('returns PARALLEL for non-overlapping files in the same package', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts']),
          task('b', ['alpha/src/b.ts']),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('same package')
        expect(result.reason).toContain('no file overlap')
      })
    })

    // -----------------------------------------------------------------------
    // 4. File overlap but both read-only → PARALLEL
    // -----------------------------------------------------------------------
    describe('file overlap, both read-only', () => {
      it('returns PARALLEL when overlapping files are only read', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts'], true),
          task('b', ['alpha/src/a.ts'], true),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('read-only')
      })
    })

    // -----------------------------------------------------------------------
    // 5. File overlap with write → SERIAL
    // -----------------------------------------------------------------------
    describe('file overlap with write', () => {
      it('returns SERIAL when taskA writes and files overlap', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts'], false),
          task('b', ['alpha/src/a.ts'], true),
        )
        expect(result.canParallelize).toBe(false)
        expect(result.reason).toContain('write conflict')
        expect(result.conflictingFiles).toEqual(['alpha/src/a.ts'])
      })

      it('returns SERIAL when taskB writes and files overlap', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts'], true),
          task('b', ['alpha/src/a.ts'], false),
        )
        expect(result.canParallelize).toBe(false)
        expect(result.conflictingFiles).toEqual(['alpha/src/a.ts'])
      })

      it('returns SERIAL when both tasks write to overlapping files', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts', 'alpha/src/b.ts'], false),
          task('b', ['alpha/src/a.ts'], false),
        )
        expect(result.canParallelize).toBe(false)
        expect(result.conflictingFiles).toEqual(['alpha/src/a.ts'])
      })

      it('reports all conflicting files', () => {
        const detector = new IndependenceDetector(twoPackageGraph())
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts', 'alpha/src/b.ts'], false),
          task('b', ['alpha/src/a.ts', 'alpha/src/b.ts'], false),
        )
        expect(result.canParallelize).toBe(false)
        expect(result.conflictingFiles).toEqual(['alpha/src/a.ts', 'alpha/src/b.ts'])
      })
    })

    // -----------------------------------------------------------------------
    // 6. Cross-package dependency → SERIAL
    // -----------------------------------------------------------------------
    describe('cross-package dependency', () => {
      it('returns SERIAL when pkgA depends on pkgB', () => {
        const deps = new Map([['packages/alpha', ['packages/beta']]])
        const detector = new IndependenceDetector(twoPackageGraph(deps))
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts']),
          task('b', ['beta/src/c.ts']),
        )
        expect(result.canParallelize).toBe(false)
        expect(result.reason).toContain('cross-package dependency')
      })

      it('returns SERIAL when pkgB depends on pkgA', () => {
        const deps = new Map([['packages/beta', ['packages/alpha']]])
        const detector = new IndependenceDetector(twoPackageGraph(deps))
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts']),
          task('b', ['beta/src/c.ts']),
        )
        expect(result.canParallelize).toBe(false)
        expect(result.reason).toContain('cross-package dependency')
      })

      it('returns SERIAL when dependencies are bidirectional', () => {
        const deps = new Map([
          ['packages/alpha', ['packages/beta']],
          ['packages/beta', ['packages/alpha']],
        ])
        const detector = new IndependenceDetector(twoPackageGraph(deps))
        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts']),
          task('b', ['beta/src/c.ts']),
        )
        expect(result.canParallelize).toBe(false)
      })
    })

    // -----------------------------------------------------------------------
    // 7. Root package vs workspace package → PARALLEL
    // -----------------------------------------------------------------------
    describe('root package vs workspace package', () => {
      it('returns PARALLEL when one task is in root package and the other is in a workspace', () => {
        const packages = new Map<string, string | null>([
          ['package.json', ''],
          ['tsconfig.json', ''],
          ['alpha/src/a.ts', 'packages/alpha'],
        ])
        const detector = new IndependenceDetector(createMockPackageGraph(packages))

        const result = detector.canParallelize(
          task('root-task', ['package.json', 'tsconfig.json']),
          task('alpha-task', ['alpha/src/a.ts']),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('root package')
      })

      it('returns PARALLEL regardless of order (workspace first, root second)', () => {
        const packages = new Map<string, string | null>([
          ['package.json', ''],
          ['alpha/src/a.ts', 'packages/alpha'],
        ])
        const detector = new IndependenceDetector(createMockPackageGraph(packages))

        const result = detector.canParallelize(
          task('alpha-task', ['alpha/src/a.ts']),
          task('root-task', ['package.json']),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('root package')
      })
    })

    // -----------------------------------------------------------------------
    // 8. Files outside packages (various scenarios)
    // -----------------------------------------------------------------------
    describe('files outside packages', () => {
      it('returns PARALLEL when one task is packaged and other is not', () => {
        const packages = new Map<string, string | null>([
          ['alpha/src/a.ts', 'packages/alpha'],
          // 'scripts/build.sh' is not in the map → findPackageRoot returns null
        ])
        const detector = new IndependenceDetector(createMockPackageGraph(packages))

        const result = detector.canParallelize(
          task('a', ['alpha/src/a.ts']),
          task('b', ['scripts/build.sh']),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('different locations')
      })

      it('returns PARALLEL when unpackaged task comes first', () => {
        const packages = new Map<string, string | null>([['alpha/src/a.ts', 'packages/alpha']])
        const detector = new IndependenceDetector(createMockPackageGraph(packages))

        const result = detector.canParallelize(
          task('a', ['scripts/build.sh']),
          task('b', ['alpha/src/a.ts']),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('different locations')
      })

      it('returns PARALLEL when both outside packages and no overlap', () => {
        const packages = new Map<string, string | null>()
        const detector = new IndependenceDetector(createMockPackageGraph(packages))

        const result = detector.canParallelize(
          task('a', ['scripts/build.sh']),
          task('b', ['scripts/deploy.sh']),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('outside packages')
        expect(result.reason).toContain('no overlap')
      })

      it('returns PARALLEL when both outside packages, overlap but read-only', () => {
        const packages = new Map<string, string | null>()
        const detector = new IndependenceDetector(createMockPackageGraph(packages))

        const result = detector.canParallelize(
          task('a', ['scripts/build.sh'], true),
          task('b', ['scripts/build.sh'], true),
        )
        expect(result.canParallelize).toBe(true)
        expect(result.reason).toContain('read-only')
      })

      it('returns SERIAL when both outside packages with write overlap', () => {
        const packages = new Map<string, string | null>()
        const detector = new IndependenceDetector(createMockPackageGraph(packages))

        const result = detector.canParallelize(
          task('a', ['scripts/build.sh'], false),
          task('b', ['scripts/build.sh'], false),
        )
        expect(result.canParallelize).toBe(false)
        expect(result.reason).toContain('write conflict')
        expect(result.conflictingFiles).toEqual(['scripts/build.sh'])
      })
    })
  })

  // =========================================================================
  // analyzeTaskPair
  // =========================================================================

  describe('analyzeTaskPair', () => {
    it('returns detailed analysis for parallelizable tasks', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const analysis = detector.analyzeTaskPair(
        task('lint', ['alpha/src/a.ts']),
        task('test', ['beta/src/c.ts']),
      )

      expect(analysis.taskA).toBe('lint')
      expect(analysis.taskB).toBe('test')
      expect(analysis.canParallelize).toBe(true)
      expect(analysis.packagesA).toEqual(['packages/alpha'])
      expect(analysis.packagesB).toEqual(['packages/beta'])
      expect(analysis.overlappingFiles).toEqual([])
      expect(analysis.hasCrossPackageDependency).toBe(false)
    })

    it('returns detailed analysis for non-parallelizable tasks', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const analysis = detector.analyzeTaskPair(
        task('build', ['alpha/src/a.ts'], false),
        task('format', ['alpha/src/a.ts'], false),
      )

      expect(analysis.taskA).toBe('build')
      expect(analysis.taskB).toBe('format')
      expect(analysis.canParallelize).toBe(false)
      expect(analysis.reason).toContain('write conflict')
      expect(analysis.packagesA).toEqual(['packages/alpha'])
      expect(analysis.packagesB).toEqual(['packages/alpha'])
      expect(analysis.overlappingFiles).toEqual(['alpha/src/a.ts'])
      expect(analysis.hasCrossPackageDependency).toBe(false)
    })

    it('reports cross-package dependency in analysis', () => {
      const deps = new Map([['packages/alpha', ['packages/beta']]])
      const detector = new IndependenceDetector(twoPackageGraph(deps))

      const analysis = detector.analyzeTaskPair(
        task('a', ['alpha/src/a.ts']),
        task('b', ['beta/src/c.ts']),
      )

      expect(analysis.hasCrossPackageDependency).toBe(true)
      expect(analysis.canParallelize).toBe(false)
    })

    it('lists packages from multiple files', () => {
      const packages = new Map<string, string | null>([
        ['alpha/src/a.ts', 'packages/alpha'],
        ['beta/src/c.ts', 'packages/beta'],
        ['gamma/src/g.ts', 'packages/gamma'],
      ])
      const detector = new IndependenceDetector(createMockPackageGraph(packages))

      const analysis = detector.analyzeTaskPair(
        task('multi', ['alpha/src/a.ts', 'beta/src/c.ts']),
        task('single', ['gamma/src/g.ts']),
      )

      expect(analysis.packagesA).toContain('packages/alpha')
      expect(analysis.packagesA).toContain('packages/beta')
      expect(analysis.packagesB).toEqual(['packages/gamma'])
    })

    it('returns empty packages for files outside any package', () => {
      const packages = new Map<string, string | null>()
      const detector = new IndependenceDetector(createMockPackageGraph(packages))

      const analysis = detector.analyzeTaskPair(
        task('a', ['scripts/build.sh']),
        task('b', ['scripts/deploy.sh']),
      )

      expect(analysis.packagesA).toEqual([])
      expect(analysis.packagesB).toEqual([])
    })
  })

  // =========================================================================
  // findFalseDependencies
  // =========================================================================

  describe('findFalseDependencies', () => {
    it('identifies false dependencies (edges that can be removed)', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const tasks = [
        task('lint-alpha', ['alpha/src/a.ts'], true),
        task('lint-beta', ['beta/src/c.ts'], true),
        task('build-alpha', ['alpha/src/a.ts'], false),
      ]

      const edges = [
        { from: 'lint-alpha', to: 'lint-beta' }, // false dep: different packages
        { from: 'lint-alpha', to: 'build-alpha' }, // true dep: same file, write
      ]

      const falseDeps = detector.findFalseDependencies(tasks, edges)

      expect(falseDeps).toHaveLength(1)
      expect(falseDeps[0]!.from).toBe('lint-alpha')
      expect(falseDeps[0]!.to).toBe('lint-beta')
      expect(falseDeps[0]!.reason).toContain('different packages')
    })

    it('returns empty array when all dependencies are real', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const tasks = [
        task('build', ['alpha/src/a.ts'], false),
        task('format', ['alpha/src/a.ts'], false),
      ]

      const edges = [{ from: 'build', to: 'format' }]

      const falseDeps = detector.findFalseDependencies(tasks, edges)
      expect(falseDeps).toHaveLength(0)
    })

    it('returns all edges as false when all can be parallelized', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const tasks = [
        task('lint-alpha', ['alpha/src/a.ts'], true),
        task('lint-beta', ['beta/src/c.ts'], true),
        task('test-alpha', ['alpha/src/b.ts'], true),
      ]

      const edges = [
        { from: 'lint-alpha', to: 'lint-beta' },
        { from: 'lint-beta', to: 'test-alpha' },
        { from: 'lint-alpha', to: 'test-alpha' },
      ]

      const falseDeps = detector.findFalseDependencies(tasks, edges)
      expect(falseDeps).toHaveLength(3)
    })

    it('skips edges where tasks are not found', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const tasks = [task('lint-alpha', ['alpha/src/a.ts'], true)]

      const edges = [
        { from: 'lint-alpha', to: 'nonexistent' },
        { from: 'ghost', to: 'lint-alpha' },
        { from: 'ghost-a', to: 'ghost-b' },
      ]

      const falseDeps = detector.findFalseDependencies(tasks, edges)
      expect(falseDeps).toHaveLength(0)
    })

    it('handles empty edges array', () => {
      const detector = new IndependenceDetector(twoPackageGraph())
      const tasks = [task('a', ['alpha/src/a.ts'])]
      const falseDeps = detector.findFalseDependencies(tasks, [])
      expect(falseDeps).toHaveLength(0)
    })

    it('handles empty tasks array', () => {
      const detector = new IndependenceDetector(twoPackageGraph())
      const edges = [{ from: 'a', to: 'b' }]
      const falseDeps = detector.findFalseDependencies([], edges)
      expect(falseDeps).toHaveLength(0)
    })

    it('correctly mixes true and false deps in a complex graph', () => {
      const deps = new Map([['packages/alpha', ['packages/beta']]])
      const detector = new IndependenceDetector(twoPackageGraph(deps))

      const tasks = [
        task('build-alpha', ['alpha/src/a.ts'], false),
        task('build-beta', ['beta/src/c.ts'], false),
        task('lint-alpha', ['alpha/src/b.ts'], true),
        task('docs', []),
      ]

      const edges = [
        { from: 'build-alpha', to: 'build-beta' }, // true dep: cross-package dependency
        { from: 'build-alpha', to: 'lint-alpha' }, // false dep: same pkg, no overlap
        { from: 'build-beta', to: 'lint-alpha' }, // false dep: different pkgs, but alpha depends on beta — check direction
        { from: 'lint-alpha', to: 'docs' }, // false dep: docs has no files
      ]

      const falseDeps = detector.findFalseDependencies(tasks, edges)

      const falsePairs = falseDeps.map((d) => `${d.from}->${d.to}`)

      // build-alpha -> build-beta: alpha depends on beta → cross-dep → SERIAL
      expect(falsePairs).not.toContain('build-alpha->build-beta')

      // build-alpha -> lint-alpha: same package, different files → PARALLEL (false dep)
      expect(falsePairs).toContain('build-alpha->lint-alpha')

      // lint-alpha -> docs: docs has no files → PARALLEL (false dep)
      expect(falsePairs).toContain('lint-alpha->docs')
    })
  })

  // =========================================================================
  // analyzeAllPairs
  // =========================================================================

  describe('analyzeAllPairs', () => {
    it('analyzes all unique pairs', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const tasks = [
        task('a', ['alpha/src/a.ts'], true),
        task('b', ['beta/src/c.ts'], true),
        task('c', ['alpha/src/b.ts'], true),
      ]

      const result = detector.analyzeAllPairs(tasks)

      // 3 tasks → 3 pairs: (a,b), (a,c), (b,c)
      expect(result.totalPairs).toBe(3)
      expect(result.analyses).toHaveLength(3)

      // All should be parallelizable in this config
      expect(result.parallelizablePairs).toBe(3)

      // Verify pair ordering: i < j means pairs are (0,1), (0,2), (1,2)
      expect(result.analyses[0]!.taskA).toBe('a')
      expect(result.analyses[0]!.taskB).toBe('b')
      expect(result.analyses[1]!.taskA).toBe('a')
      expect(result.analyses[1]!.taskB).toBe('c')
      expect(result.analyses[2]!.taskA).toBe('b')
      expect(result.analyses[2]!.taskB).toBe('c')
    })

    it('correctly counts serial pairs', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const tasks = [
        task('writer-a', ['alpha/src/a.ts'], false),
        task('writer-b', ['alpha/src/a.ts'], false),
        task('reader', ['beta/src/c.ts'], true),
      ]

      const result = detector.analyzeAllPairs(tasks)

      expect(result.totalPairs).toBe(3)
      // writer-a vs writer-b: SERIAL (same file, both write)
      // writer-a vs reader: PARALLEL (different packages)
      // writer-b vs reader: PARALLEL (different packages)
      expect(result.parallelizablePairs).toBe(2)
    })

    it('handles a single task (zero pairs)', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const result = detector.analyzeAllPairs([task('solo', ['alpha/src/a.ts'])])

      expect(result.totalPairs).toBe(0)
      expect(result.parallelizablePairs).toBe(0)
      expect(result.analyses).toEqual([])
    })

    it('handles empty task array', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const result = detector.analyzeAllPairs([])

      expect(result.totalPairs).toBe(0)
      expect(result.parallelizablePairs).toBe(0)
      expect(result.analyses).toEqual([])
    })

    it('handles two tasks', () => {
      const detector = new IndependenceDetector(twoPackageGraph())

      const result = detector.analyzeAllPairs([
        task('a', ['alpha/src/a.ts']),
        task('b', ['beta/src/c.ts']),
      ])

      expect(result.totalPairs).toBe(1)
      expect(result.analyses).toHaveLength(1)
      expect(result.analyses[0]!.taskA).toBe('a')
      expect(result.analyses[0]!.taskB).toBe('b')
    })

    it('includes detailed analysis for each pair', () => {
      const deps = new Map([['packages/alpha', ['packages/beta']]])
      const detector = new IndependenceDetector(twoPackageGraph(deps))

      const tasks = [task('alpha-task', ['alpha/src/a.ts']), task('beta-task', ['beta/src/c.ts'])]

      const result = detector.analyzeAllPairs(tasks)

      expect(result.totalPairs).toBe(1)
      const analysis = result.analyses[0]!
      expect(analysis.canParallelize).toBe(false)
      expect(analysis.hasCrossPackageDependency).toBe(true)
      expect(analysis.packagesA).toEqual(['packages/alpha'])
      expect(analysis.packagesB).toEqual(['packages/beta'])
    })
  })

  // =========================================================================
  // createMockPackageGraph
  // =========================================================================

  describe('createMockPackageGraph', () => {
    it('returns null for unknown file paths', () => {
      const graph = createMockPackageGraph(new Map())
      expect(graph.findPackageRoot('unknown/file.ts')).toBeNull()
    })

    it('maps file paths to package roots', () => {
      const packages = new Map<string, string | null>([['src/index.ts', 'packages/core']])
      const graph = createMockPackageGraph(packages)
      expect(graph.findPackageRoot('src/index.ts')).toBe('packages/core')
    })

    it('returns package root as package name', () => {
      const graph = createMockPackageGraph(new Map())
      expect(graph.getPackageName('packages/core')).toBe('packages/core')
    })

    it('detects cross-package dependencies', () => {
      const deps = new Map([['packages/alpha', ['packages/beta']]])
      const graph = createMockPackageGraph(new Map(), deps)

      expect(graph.hasCrossPackageDependency('packages/alpha', 'packages/beta')).toBe(true)
      expect(graph.hasCrossPackageDependency('packages/beta', 'packages/alpha')).toBe(false)
    })

    it('defaults to no dependencies', () => {
      const graph = createMockPackageGraph(new Map())
      expect(graph.hasCrossPackageDependency('a', 'b')).toBe(false)
    })

    it('detects same-package files', () => {
      const packages = new Map<string, string | null>([
        ['src/a.ts', 'packages/core'],
        ['src/b.ts', 'packages/core'],
        ['src/c.ts', 'packages/other'],
      ])
      const graph = createMockPackageGraph(packages)

      expect(graph.areInSamePackage('src/a.ts', 'src/b.ts')).toBe(true)
      expect(graph.areInSamePackage('src/a.ts', 'src/c.ts')).toBe(false)
    })

    it('treats unmapped files as same package (undefined === undefined)', () => {
      const graph = createMockPackageGraph(new Map())
      // packages.get() returns undefined for unmapped files.
      // The implementation checks `pkgA !== null && pkgA === pkgB`.
      // undefined !== null → true, undefined === undefined → true, so result is true.
      expect(graph.areInSamePackage('unknown/a.ts', 'unknown/b.ts')).toBe(true)
    })
  })

  // =========================================================================
  // Edge cases & integration-style scenarios
  // =========================================================================

  describe('edge cases', () => {
    it('handles tasks spanning multiple packages', () => {
      const packages = new Map<string, string | null>([
        ['alpha/src/a.ts', 'packages/alpha'],
        ['beta/src/c.ts', 'packages/beta'],
        ['gamma/src/g.ts', 'packages/gamma'],
      ])
      const detector = new IndependenceDetector(createMockPackageGraph(packages))

      // Task A spans alpha and beta; Task B is in gamma only
      const result = detector.canParallelize(
        task('a', ['alpha/src/a.ts', 'beta/src/c.ts']),
        task('b', ['gamma/src/g.ts']),
      )
      expect(result.canParallelize).toBe(true)
    })

    it('handles tasks spanning overlapping packages', () => {
      const packages = new Map<string, string | null>([
        ['alpha/src/a.ts', 'packages/alpha'],
        ['alpha/src/b.ts', 'packages/alpha'],
        ['beta/src/c.ts', 'packages/beta'],
      ])
      const detector = new IndependenceDetector(createMockPackageGraph(packages))

      // Task A is in alpha; Task B spans alpha and beta — packages overlap
      const result = detector.canParallelize(
        task('a', ['alpha/src/a.ts'], false),
        task('b', ['alpha/src/b.ts', 'beta/src/c.ts'], false),
      )
      // They share the alpha package but different files → same package, no file overlap
      expect(result.canParallelize).toBe(true)
      expect(result.reason).toContain('same package')
    })

    it('handles task with files mapping to null (outside any package)', () => {
      const packages = new Map<string, string | null>([
        ['config.json', null],
        ['alpha/src/a.ts', 'packages/alpha'],
      ])
      const detector = new IndependenceDetector(createMockPackageGraph(packages))

      const result = detector.canParallelize(
        task('config', ['config.json']),
        task('code', ['alpha/src/a.ts']),
      )
      expect(result.canParallelize).toBe(true)
      expect(result.reason).toContain('different locations')
    })

    it('handles many tasks in analyzeAllPairs (combinatorial count)', () => {
      const packages = new Map<string, string | null>([
        ['a.ts', 'packages/alpha'],
        ['b.ts', 'packages/beta'],
        ['c.ts', 'packages/gamma'],
        ['d.ts', 'packages/delta'],
      ])
      const detector = new IndependenceDetector(createMockPackageGraph(packages))

      const tasks = [
        task('1', ['a.ts'], true),
        task('2', ['b.ts'], true),
        task('3', ['c.ts'], true),
        task('4', ['d.ts'], true),
      ]

      const result = detector.analyzeAllPairs(tasks)
      // C(4,2) = 6 pairs
      expect(result.totalPairs).toBe(6)
      expect(result.parallelizablePairs).toBe(6)
    })
  })
})
