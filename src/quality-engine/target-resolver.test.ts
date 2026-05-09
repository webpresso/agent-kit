/**
 * Target Resolver Tests
 *
 * Tests for the pure target resolution functions.
 * Uses injected mock filesystems to avoid depending on monorepo structure.
 */

import { describe, expect, it } from 'vitest'

import {
  findFirstExistingPath,
  findMatchingPackages,
  findRepoRoot,
  generatePathCandidates,
  getWorkspacePackages,
  isCategoryQuery,
  isFilePath,
  looksLikeFilePath,
  matchPackage,
  normalizeVariadicFlag,
  parseQueryTokens,
  readPackageInfo,
  resolveCommandTargets,
  resolvePackageFilters,
  resolvePackagePaths,
  resolvePartialPath,
  resolveTargetStrict,
  shouldSkipDirectory,
  type FileSystem,
  type PackageInfo,
} from './target-resolver'

// =============================================================================
// Mock file system helpers
// =============================================================================

/**
 * Create a mock FileSystem simulating a pnpm workspace with the given packages.
 */
function createMockFs(
  packages: Array<{ dir: string; name: string }>,
  repoRoot = '/repo',
  workspacePackages: string[] = ['packages/**'],
): FileSystem {
  const dirs = new Set<string>()
  const files = new Map<string, string>()

  files.set(
    `${repoRoot}/pnpm-workspace.yaml`,
    `packages:\n${workspacePackages.map((pattern) => `  - ${pattern}\n`).join('')}`,
  )
  dirs.add(repoRoot)

  for (const pkg of packages) {
    const parts = pkg.dir.split('/')
    for (let i = 1; i <= parts.length; i++) {
      dirs.add(`${repoRoot}/${parts.slice(0, i).join('/')}`)
    }
    const pkgDir = `${repoRoot}/${pkg.dir}`
    dirs.add(pkgDir)
    files.set(`${pkgDir}/package.json`, JSON.stringify({ name: pkg.name }))
  }

  return {
    existsSync: (p) => files.has(p) || dirs.has(p),
    statSync: (p) => {
      if (files.has(p)) return { isFile: () => true, isDirectory: () => false } as ReturnType<FileSystem['statSync']>
      if (dirs.has(p)) return { isFile: () => false, isDirectory: () => true } as ReturnType<FileSystem['statSync']>
      throw new Error(`ENOENT: ${p}`)
    },
    readdirSync: (p) => {
      const prefix = p.endsWith('/') ? p : `${p}/`
      const seen = new Set<string>()
      const entries: ReturnType<FileSystem['readdirSync']>[number][] = []
      for (const dir of dirs) {
        if (dir.startsWith(prefix) && !dir.slice(prefix.length).includes('/')) {
          const name = dir.slice(prefix.length)
          if (name && !seen.has(name)) {
            seen.add(name)
            entries.push({ name, isDirectory: () => true, isFile: () => false } as ReturnType<FileSystem['readdirSync']>[number])
          }
        }
      }
      return entries
    },
    readFileSync: (p) => {
      const content = files.get(p)
      if (content === undefined) throw new Error(`ENOENT: ${p}`)
      return content
    },
  }
}

const MOCK_PACKAGES = [
  { dir: 'packages/cli/cli2', name: '@webpresso/cli2' },
  { dir: 'packages/foundation/config', name: '@webpresso/config' },
  { dir: 'packages/sdk/control-plane-client', name: '@webpresso/control-plane-client' },
]

const GENERIC_PACKAGES = [
  { dir: 'apps/client', name: '@repo/client' },
  { dir: 'apps/e2e', name: '@repo/e2e' },
  { dir: 'packages/ui', name: '@repo/ui' },
  { dir: 'infra', name: '@repo/infra' },
]
const MOCK_REPO_ROOT = '/repo'
const mockFs = createMockFs(MOCK_PACKAGES, MOCK_REPO_ROOT)

// =============================================================================
// Tests
// =============================================================================

describe('resolveTargetStrict', () => {
  it('returns all targets when query is empty or whitespace', () => {
    expect(resolveTargetStrict()).toEqual({ type: 'all', value: [] })
    expect(resolveTargetStrict('   ')).toEqual({ type: 'all', value: [] })
  })

  it('resolves scoped package names directly', () => {
    const result = resolveTargetStrict('@webpresso/cli2', { fs: mockFs, repoRoot: MOCK_REPO_ROOT })
    expect(result).toEqual({ type: 'package', value: ['--filter=@webpresso/cli2'] })
  })

  it('resolves sdk packages by short and scoped names', () => {
    expect(
      resolveTargetStrict('control-plane-client', { fs: mockFs, repoRoot: MOCK_REPO_ROOT }),
    ).toEqual({
      type: 'package',
      value: ['--filter=@webpresso/control-plane-client'],
    })

    expect(
      resolveTargetStrict('@webpresso/control-plane-client', { fs: mockFs, repoRoot: MOCK_REPO_ROOT }),
    ).toEqual({
      type: 'package',
      value: ['--filter=@webpresso/control-plane-client'],
    })
  })

  it('prefers exact short-name matches over fuzzy substring matches', () => {
    expect(resolveTargetStrict('config', { fs: mockFs, repoRoot: MOCK_REPO_ROOT })).toEqual({
      type: 'package',
      value: ['--filter=@webpresso/config'],
    })
  })

  it('resolves short names and deduplicates filters', () => {
    const result = resolveTargetStrict('cli2, config cli2', { fs: mockFs, repoRoot: MOCK_REPO_ROOT })

    expect(result.type).toBe('package')
    expect(result.value).toEqual(
      expect.arrayContaining(['--filter=@webpresso/cli2', '--filter=@webpresso/config']),
    )
    expect(new Set(result.value).size).toBe(result.value.length)
  })

  it('accepts explicit workspace packages without repoRoot fallback', () => {
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)

    expect(
      resolveTargetStrict('cli2', {
        fs: mockFs,
        workspacePackages: packages,
      }),
    ).toEqual({
      type: 'package',
      value: ['--filter=@webpresso/cli2'],
    })
  })

  it('requires explicit workspace context for package resolution', () => {
    expect(() => resolveTargetStrict('cli2', { fs: mockFs })).toThrow(
      'Package resolution requires explicit workspace context',
    )
  })

  it('throws descriptive error when package is not found', () => {
    expect(() =>
      resolveTargetStrict('unknown-app', { fs: mockFs, repoRoot: MOCK_REPO_ROOT }),
    ).toThrow('Package not found: "unknown-app"')
    expect(() =>
      resolveTargetStrict('unknown-app', { fs: mockFs, repoRoot: MOCK_REPO_ROOT }),
    ).toThrow('--file')
  })

  it('rejects flag typos with actionable suggestions', () => {
    expect(() => resolveTargetStrict('fix')).toThrow('Invalid target "fix"')
    expect(() => resolveTargetStrict('fix')).toThrow('--fix')

    expect(() => resolveTargetStrict('--fix')).toThrow('Invalid target "--fix"')
    expect(() => resolveTargetStrict('--fix')).toThrow('place after target')
  })
})

describe('findMatchingPackages', () => {
  it('returns the exact package when the query matches a package leaf directory', () => {
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)
    const matches = findMatchingPackages(packages, 'config')

    expect(matches.map((pkg) => pkg.name)).toEqual(['@webpresso/config'])
  })

  it('matches non-webpresso scoped packages by short name', () => {
    const genericFs = createMockFs(GENERIC_PACKAGES, MOCK_REPO_ROOT, ['apps/*', 'packages/*', 'infra'])
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, genericFs)
    const matches = findMatchingPackages(packages, 'client')

    expect(matches.map((pkg) => pkg.name)).toEqual(['@repo/client'])
  })
})

describe('getWorkspacePackages', () => {
  it('respects workspace patterns from pnpm-workspace.yaml', () => {
    const genericFs = createMockFs(GENERIC_PACKAGES, MOCK_REPO_ROOT, ['apps/*', 'packages/*', 'infra'])

    expect(getWorkspacePackages(MOCK_REPO_ROOT, genericFs)).toEqual(
      expect.arrayContaining([
        { name: '@repo/client', path: '/repo/apps/client' },
        { name: '@repo/e2e', path: '/repo/apps/e2e' },
        { name: '@repo/ui', path: '/repo/packages/ui' },
        { name: '@repo/infra', path: '/repo/infra' },
      ]),
    )
  })
})

describe('looksLikeFilePath', () => {
  it('detects common file extensions', () => {
    expect(looksLikeFilePath('foo.ts')).toBe(true)
    expect(looksLikeFilePath('foo.test.ts')).toBe(true)
    expect(looksLikeFilePath('foo.tsx')).toBe(true)
    expect(looksLikeFilePath('packages/cli2/src/index.js')).toBe(true)
    expect(looksLikeFilePath('style.css')).toBe(true)
    expect(looksLikeFilePath('data.json')).toBe(true)
  })

  it('rejects non-file strings', () => {
    expect(looksLikeFilePath('cli2')).toBe(false)
    expect(looksLikeFilePath('platform')).toBe(false)
    expect(looksLikeFilePath('@webpresso/cli2')).toBe(false)
  })
})

describe('normalizeVariadicFlag', () => {
  it('normalizes single value', () => {
    expect(normalizeVariadicFlag('--package', ['cli2'])).toEqual(['cli2'])
  })

  it('normalizes multiple values', () => {
    expect(normalizeVariadicFlag('--package', ['cli2', 'config'])).toEqual(['cli2', 'config'])
  })

  it('splits comma-separated values', () => {
    expect(normalizeVariadicFlag('--package', ['cli2,config'])).toEqual(['cli2', 'config'])
  })

  it('trims whitespace', () => {
    expect(normalizeVariadicFlag('--package', ['  cli2  ', '  config  '])).toEqual([
      'cli2',
      'config',
    ])
  })

  it('throws on empty values', () => {
    expect(() => normalizeVariadicFlag('--package', [])).toThrow(
      '--package requires at least one non-empty value',
    )
    expect(() => normalizeVariadicFlag('--package', [''])).toThrow(
      '--package requires at least one non-empty value',
    )
  })

  it('throws on whitespace-only values', () => {
    expect(() => normalizeVariadicFlag('--package', ['   ', '  '])).toThrow(
      '--package requires at least one non-empty value',
    )
  })

  it('splits whitespace-separated tokens within a single item', () => {
    expect(normalizeVariadicFlag('--package', ['cli2 config platform'])).toEqual([
      'cli2',
      'config',
      'platform',
    ])
  })
})

describe('resolveCommandTargets', () => {
  it('returns all when no targets or options provided', () => {
    expect(resolveCommandTargets('test', [], {})).toEqual({ type: 'all', value: [] })
  })

  it('resolves package flag', () => {
    const result = resolveCommandTargets(
      'test',
      [],
      { package: ['cli2'] },
      { fs: mockFs, repoRoot: MOCK_REPO_ROOT },
    )
    expect(result.type).toBe('package')
    expect(result.value).toContain('--filter=@webpresso/cli2')
  })

  it('resolves package flag with explicit workspace packages', () => {
    const workspacePackages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)
    const result = resolveCommandTargets(
      'test',
      [],
      { package: ['cli2'] },
      { fs: mockFs, workspacePackages },
    )

    expect(result).toEqual({
      type: 'package',
      value: ['--filter=@webpresso/cli2'],
    })
  })

  it('resolves file flag', () => {
    const result = resolveCommandTargets('test', [], { file: ['foo.ts'] })
    expect(result).toEqual({ type: 'file', value: ['foo.ts'] })
  })

  it('throws when both package and file flags are provided', () => {
    expect(() =>
      resolveCommandTargets('test', [], { package: ['cli2'], file: ['foo.ts'] }),
    ).toThrow('Cannot use both --package and --file')
  })

  it('requires explicit workspace context for --package targets', () => {
    expect(() => resolveCommandTargets('test', [], { package: ['cli2'] }, { fs: mockFs })).toThrow(
      'Package resolution requires explicit workspace context',
    )
  })

  it('auto-detects file paths by extension', () => {
    const result = resolveCommandTargets('test', ['foo.ts'], {})
    expect(result).toEqual({ type: 'file', value: ['foo.ts'] })
  })

  it('throws for ambiguous inputs', () => {
    expect(() => resolveCommandTargets('test', ['unknown'], {})).toThrow('Ambiguous input')
    expect(() => resolveCommandTargets('test', ['unknown'], {})).toThrow('--package or --file')
  })

  it('throws when combining positional target with --package flag', () => {
    expect(() =>
      resolveCommandTargets('test', ['cli2'], { package: ['cli2'] }),
    ).toThrow('Cannot combine positional target')
  })

  it('throws when combining positional target with --file flag', () => {
    expect(() =>
      resolveCommandTargets('test', ['foo.ts'], { file: ['foo.ts'] }),
    ).toThrow('Cannot combine positional target')
  })

  it('throws on multiple positional targets', () => {
    expect(() => resolveCommandTargets('test', ['a', 'b'], {})).toThrow(
      'Multiple positional targets are not supported',
    )
  })

  it('rejects single empty string as positional target', () => {
    expect(resolveCommandTargets('test', [''], {})).toEqual({ type: 'all', value: [] })
  })

  it('rejects whitespace-only target as empty', () => {
    expect(resolveCommandTargets('test', ['   '], {})).toEqual({ type: 'all', value: [] })
  })

  describe('path-like targets', () => {
    it('resolves path-like target with / as package when package exists', () => {
      const result = resolveCommandTargets(
        'test',
        ['packages/cli/cli2'],
        {},
        { fs: mockFs, repoRoot: MOCK_REPO_ROOT },
      )
      expect(result.type).toBe('package')
    })
  })
})

// =============================================================================
// Additional utility function tests
// =============================================================================

describe('findRepoRoot', () => {
  it('finds repo root when workspace marker exists', () => {
    const root = findRepoRoot(MOCK_REPO_ROOT, mockFs)
    expect(root).toBe(MOCK_REPO_ROOT)
  })

  it('returns startDir when not found and at filesystem root', () => {
    const emptyFs: FileSystem = {
      existsSync: () => false,
      statSync: () => {
        throw new Error('ENOENT')
      },
      readdirSync: () => [],
      readFileSync: () => {
        throw new Error('ENOENT')
      },
    }
    const root = findRepoRoot('/some/nested/dir', emptyFs)
    expect(root).toBe('/some/nested/dir')
  })
})

describe('isFilePath', () => {
  it('returns true for existing file', () => {
    // Use absolute path to a file in the mock fs
    expect(isFilePath('/repo/packages/cli/cli2/package.json', '/repo', mockFs)).toBe(true)
  })

  it('returns false for directories', () => {
    expect(isFilePath('/repo/packages/cli/cli2', '/repo', mockFs)).toBe(false)
  })

  it('returns false for non-existent paths', () => {
    expect(isFilePath('/repo/nonexistent.ts', '/repo', mockFs)).toBe(false)
  })
})

describe('generatePathCandidates', () => {
  it('returns single candidate for absolute paths', () => {
    expect(generatePathCandidates('/absolute/path.ts')).toEqual(['/absolute/path.ts'])
  })

  it('returns candidates with prefixes for relative paths', () => {
    const candidates = generatePathCandidates('src/index.ts')
    expect(candidates[0]).toBe('src/index.ts')
    expect(candidates.length).toBeGreaterThan(1)
    expect(candidates.some((c) => c.includes('/'))).toBe(true)
  })
})

describe('readPackageInfo', () => {
  it('returns package info for valid package.json', () => {
    const info = readPackageInfo(`${MOCK_REPO_ROOT}/packages/cli/cli2`, mockFs)
    expect(info).toEqual({
      name: '@webpresso/cli2',
      path: `${MOCK_REPO_ROOT}/packages/cli/cli2`,
    })
  })

  it('returns null for missing package.json', () => {
    const info = readPackageInfo(`${MOCK_REPO_ROOT}/nonexistent`, mockFs)
    expect(info).toBeNull()
  })

  it('returns null when package.json has no name field', () => {
    const noNameFs = createMockFs([{ dir: 'packages/test/no-name', name: '' }])
    // Override the package.json to have a non-string name
    const origReadFileSync = noNameFs.readFileSync
    const customFs: FileSystem = {
      ...noNameFs,
      readFileSync: (p: string) => {
        if (p.includes('no-name')) return '{"name":123}'
        return origReadFileSync(p)
      },
      existsSync: (p: string) => {
        if (p.includes('no-name')) return true
        return noNameFs.existsSync(p)
      },
      statSync: (p: string) => {
        if (p.includes('no-name') && p.endsWith('package.json'))
          return { isFile: () => true, isDirectory: () => false } as ReturnType<FileSystem['statSync']>
        return noNameFs.statSync(p)
      },
      readdirSync: (p: string) => {
        if (p.includes('test')) {
          return [{ name: 'no-name', isDirectory: () => true, isFile: () => false }] as ReturnType<FileSystem['readdirSync']>
        }
        return noNameFs.readdirSync(p)
      },
    }
    const info = readPackageInfo('/repo/packages/test/no-name', customFs)
    expect(info).toBeNull()
  })
})

describe('shouldSkipDirectory', () => {
  it('returns true for node_modules', () => {
    expect(shouldSkipDirectory('node_modules')).toBe(true)
  })

  it('returns true for templates', () => {
    expect(shouldSkipDirectory('templates')).toBe(true)
  })

  it('returns false for regular directories', () => {
    expect(shouldSkipDirectory('src')).toBe(false)
  })
})

describe('isCategoryQuery', () => {
  it('returns true for platform', () => {
    expect(isCategoryQuery('platform')).toBe(true)
  })

  it('returns true for admin', () => {
    expect(isCategoryQuery('admin')).toBe(true)
  })

  it('returns true for website', () => {
    expect(isCategoryQuery('website')).toBe(true)
  })

  it('returns false for non-category query', () => {
    expect(isCategoryQuery('cli2')).toBe(false)
  })
})

describe('matchPackage', () => {
  const pkg: PackageInfo = {
    name: '@webpresso/cli2',
    path: 'packages/cli/cli2',
  }

  it('matches by full package name', () => {
    expect(matchPackage(pkg, '@webpresso/cli2')).toBe(true)
  })

  it('matches by short name', () => {
    expect(matchPackage(pkg, 'cli2')).toBe(true)
  })

  it('matches by path', () => {
    expect(matchPackage(pkg, 'packages/cli/cli2')).toBe(true)
  })

  it('matches by leaf directory', () => {
    expect(matchPackage(pkg, 'cli2')).toBe(true)
  })

  it('matches by substring in name', () => {
    expect(matchPackage(pkg, 'cli')).toBe(true)
  })

  it('matches by substring in short name', () => {
    expect(matchPackage(pkg, 'li')).toBe(true)
  })

  it('matches by substring in path', () => {
    expect(matchPackage(pkg, 'packages/cli')).toBe(true)
  })

  it('does not match unrelated query', () => {
    expect(matchPackage(pkg, 'completely-different')).toBe(false)
  })
})

describe('parseQueryTokens', () => {
  it('splits by comma', () => {
    expect(parseQueryTokens('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('splits by whitespace', () => {
    expect(parseQueryTokens('a b c')).toEqual(['a', 'b', 'c'])
  })

  it('handles mixed separators', () => {
    expect(parseQueryTokens('a,b c')).toEqual(['a', 'b', 'c'])
  })

  it('filters empty tokens', () => {
    expect(parseQueryTokens('a,,b')).toEqual(['a', 'b'])
    expect(parseQueryTokens('a  b')).toEqual(['a', 'b'])
  })

  it('returns empty array for empty string', () => {
    expect(parseQueryTokens('')).toEqual([])
  })

  it('returns empty array for whitespace', () => {
    expect(parseQueryTokens('  ,  ,  ')).toEqual([])
  })
})

describe('findMatchingPackages', () => {
  it('returns empty array when query matches no package', () => {
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)
    expect(findMatchingPackages(packages, 'nonexistent')).toEqual([])
  })

  it('finds package by substring match when no exact match', () => {
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)
    const matches = findMatchingPackages(packages, 'control')
    expect(matches.length).toBe(1)
    expect(matches[0]!.name).toBe('@webpresso/control-plane-client')
  })

  it('resolves category query "platform"', () => {
    const mockFsWithPlatform = createMockFs([
      ...MOCK_PACKAGES,
      { dir: 'apps/agile-vibe/platform-api', name: '@webpresso/platform-api' },
    ], '/repo', ['packages/**', 'apps/agile-vibe/*'])
    const packages = getWorkspacePackages('/repo', mockFsWithPlatform)
    const matches = findMatchingPackages(packages, 'platform')
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every((p) => p.name.includes('platform'))).toBe(true)
  })
})

describe('resolvePackageFilters', () => {
  it('returns filters for matching packages', () => {
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)
    const filters = resolvePackageFilters('cli2', packages)
    expect(filters).toContain('--filter=@webpresso/cli2')
  })

  it('returns empty for non-matching query', () => {
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)
    expect(resolvePackageFilters('nonexistent', packages)).toEqual([])
  })
})

describe('resolvePackagePaths', () => {
  it('returns paths for matching packages', () => {
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)
    const paths = resolvePackagePaths('cli2', packages)
    expect(paths).toContain(`${MOCK_REPO_ROOT}/packages/cli/cli2`)
  })

  it('returns empty for non-matching query', () => {
    const packages = getWorkspacePackages(MOCK_REPO_ROOT, mockFs)
    expect(resolvePackagePaths('nonexistent', packages)).toEqual([])
  })
})

describe('findFirstExistingPath', () => {
  it('returns the first existing path from candidates', () => {
    // packages/cli/cli2/package.json is a file in the mock fs
    const result = findFirstExistingPath(
      ['packages/cli/cli2/package.json', 'nonexistent/path'],
      MOCK_REPO_ROOT,
      mockFs,
    )
    expect(result).toBe('packages/cli/cli2/package.json')
  })

  it('returns null when no candidate exists', () => {
    const result = findFirstExistingPath(
      ['nonexistent/path', 'another/nonexistent'],
      MOCK_REPO_ROOT,
      mockFs,
    )
    expect(result).toBeNull()
  })

  it('returns null for empty candidates', () => {
    const result = findFirstExistingPath([], MOCK_REPO_ROOT, mockFs)
    expect(result).toBeNull()
  })
})

describe('resolvePartialPath', () => {
  it('resolves a partial path by trying common prefixes', () => {
    // generatePathCandidates('cli2/package.json') will try:
    // 'cli2/package.json', 'packages/cli/cli2/package.json', etc.
    // The mock has packages/cli/cli2/package.json
    const result = resolvePartialPath('cli2/package.json', MOCK_REPO_ROOT, mockFs)
    expect(result).toBe('packages/cli/cli2/package.json')
  })

  it('returns null for unresolvable path', () => {
    const result = resolvePartialPath('nonexistent.ts', MOCK_REPO_ROOT, mockFs)
    expect(result).toBeNull()
  })
})

describe('findMatchingPackages with category query', () => {
  it('resolves admin category query matching admin-web packages', () => {
    const mockFs2 = createMockFs([
      ...MOCK_PACKAGES,
      { dir: 'apps/web/admin-web', name: '@webpresso/admin-web' },
    ], '/repo', ['packages/**', 'apps/web/*'])
    const packages = getWorkspacePackages('/repo', mockFs2)
    const matches = findMatchingPackages(packages, 'admin')
    const names = matches.map((p) => p.name)
    expect(names).toContain('@webpresso/admin-web')
  })

  it('resolves website category query matching website exactly', () => {
    const mockFs2 = createMockFs([
      ...MOCK_PACKAGES,
      { dir: 'apps/web/website', name: '@webpresso/website' },
    ], '/repo', ['packages/**', 'apps/web/*'])
    const packages = getWorkspacePackages('/repo', mockFs2)
    const matches = findMatchingPackages(packages, 'website')
    const names = matches.map((p) => p.name)
    expect(names).toContain('@webpresso/website')
  })
})
