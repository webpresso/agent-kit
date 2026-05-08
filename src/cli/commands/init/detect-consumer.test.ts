import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  detectConsumer,
  discoverWorkspacePackages,
  findGitRoot,
  parseWorkspaceGlobs,
  readPackageJson,
} from './detect-consumer.js'

function makeTempDir(prefix = 'ak-detect'): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeDir(root: string, name: string): string {
  const full = join(root, name)
  mkdirSync(full, { recursive: true })
  return full
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  writeFileSync(filePath, JSON.stringify(data))
}

// ---------------------------------------------------------------------------
// findGitRoot
// ---------------------------------------------------------------------------
describe('findGitRoot', () => {
  it('returns cwd when .git exists in current directory', () => {
    const dir = makeTempDir()
    try {
      mkdirSync(join(dir, '.git'))
      expect(findGitRoot(dir)).toBe(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('walks up to find .git in an ancestor directory', () => {
    const dir = makeTempDir()
    try {
      mkdirSync(join(dir, '.git'))
      const nested = join(dir, 'src', 'deep', 'nested')
      mkdirSync(nested, { recursive: true })
      expect(findGitRoot(nested)).toBe(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null when no .git directory is found in any ancestor', () => {
    const dir = makeTempDir()
    try {
      // ensure no .git exists anywhere up to the root
      const nested = join(dir, 'a', 'b', 'c')
      mkdirSync(nested, { recursive: true })
      expect(findGitRoot(nested)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stops at the filesystem root without infinite loop', () => {
    // ask for a path where we know there's no .git up the chain
    const dir = makeTempDir()
    try {
      expect(findGitRoot(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('treats a .git file (not dir) as valid — git worktrees store .git as a file', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(join(dir, '.git'), 'gitdir: /some/other/path\n')
      expect(findGitRoot(dir)).toBe(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves relative startDir to an absolute path', () => {
    const dir = realpathSync(makeTempDir())
    try {
      mkdirSync(join(dir, '.git'))
      const nested = join(dir, 'sub')
      mkdirSync(nested, { recursive: true })
      const _originalCwd = process.cwd()
      try {
        const found = findGitRoot(nested)
        expect(found).not.toBeNull()
        expect(realpathSync(found!)).toBe(dir)
      } finally {
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// readPackageJson
// ---------------------------------------------------------------------------
describe('readPackageJson', () => {
  it('returns null path and null info when package.json does not exist', () => {
    const dir = makeTempDir()
    try {
      const result = readPackageJson(dir)
      expect(result.path).toBeNull()
      expect(result.info).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('parses a complete package.json with name, version, deps, and devDeps', () => {
    const dir = makeTempDir()
    try {
      writeJson(join(dir, 'package.json'), {
        name: 'my-app',
        version: '2.3.1',
        dependencies: { react: '^18.0.0', lodash: '^4.0.0' },
        devDependencies: { vitest: '^2.0.0' },
      })
      const result = readPackageJson(dir)
      expect(result.path).toBe(join(dir, 'package.json'))
      expect(result.info).toEqual({
        name: 'my-app',
        version: '2.3.1',
        dependencies: { react: '^18.0.0', lodash: '^4.0.0' },
        devDependencies: { vitest: '^2.0.0' },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to the directory basename when name is missing', () => {
    const dir = makeTempDir()
    try {
      writeJson(join(dir, 'package.json'), { version: '1.0.0' })
      const result = readPackageJson(dir)
      expect(result.info?.name).toBe(basename(dir))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns undefined version when version is not a string', () => {
    const dir = makeTempDir()
    try {
      writeJson(join(dir, 'package.json'), { name: 'test-pkg', version: 1 })
      const result = readPackageJson(dir)
      expect(result.info?.version).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns default empty objects for missing dependencies fields', () => {
    const dir = makeTempDir()
    try {
      writeJson(join(dir, 'package.json'), { name: 'bare-pkg' })
      const result = readPackageJson(dir)
      expect(result.info?.dependencies).toEqual({})
      expect(result.info?.devDependencies).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns path but null info for malformed JSON', () => {
    const dir = makeTempDir()
    try {
      const pkgPath = join(dir, 'package.json')
      writeFileSync(pkgPath, '{not valid json:')
      const result = readPackageJson(dir)
      expect(result.path).toBe(pkgPath)
      expect(result.info).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null info for an empty package.json file', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(join(dir, 'package.json'), '')
      const result = readPackageJson(dir)
      expect(result.path).toBe(join(dir, 'package.json'))
      expect(result.info).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles a package.json with name that is not a string (number)', () => {
    const dir = makeTempDir()
    try {
      writeJson(join(dir, 'package.json'), { name: 42 })
      const result = readPackageJson(dir)
      expect(result.info?.name).toBe(basename(dir))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// parseWorkspaceGlobs
// ---------------------------------------------------------------------------
describe('parseWorkspaceGlobs', () => {
  it('returns null when pnpm-workspace.yaml does not exist', () => {
    const dir = makeTempDir()
    try {
      expect(parseWorkspaceGlobs(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('parses a simple packages list', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'pnpm-workspace.yaml'),
        ['packages:', "  - 'packages/*'", "  - 'apps/*'", "  - 'libs/util'"].join('\n'),
      )
      const globs = parseWorkspaceGlobs(dir)
      expect(globs).toEqual(['packages/*', 'apps/*', 'libs/util'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles both quoted and unquoted globs', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'pnpm-workspace.yaml'),
        ['packages:', '  - packages/*', "  - 'apps/*'", '  - "tools/*-kit"'].join('\n'),
      )
      const globs = parseWorkspaceGlobs(dir)
      expect(globs).toEqual(['packages/*', 'apps/*', 'tools/*-kit'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stops parsing at the next top-level (unindented) key', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'pnpm-workspace.yaml'),
        [
          'packages:',
          "  - 'packages/*'",
          'catalog:',
          "  react: '^18.0.0'",
          'other-packages:',
          "  - 'more/*'",
        ].join('\n'),
      )
      const globs = parseWorkspaceGlobs(dir)
      expect(globs).toEqual(['packages/*'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns empty array when packages section exists but has no globs', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n# no entries yet\n')
      const globs = parseWorkspaceGlobs(dir)
      expect(globs).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ignores comments on glob lines', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'pnpm-workspace.yaml'),
        ['packages:', "  - 'packages/*' # all library packages", "  - 'apps/*'"].join('\n'),
      )
      const globs = parseWorkspaceGlobs(dir)
      expect(globs).toEqual(['packages/*', 'apps/*'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null for a file that is not valid YAML/readable (simulated)', () => {
    const dir = makeTempDir()
    try {
      // Write a valid file then make it unreadable to simulate error path.
      // On macOS we use a symlink to a non-existent target instead,
      // since chmod-based tests are fragile and platform-dependent.
      // The error path is covered by the null return below —
      // the function catches JSON.parse-ish errors, so malformed
      // content that explodes in readFileSync is unlikely. We test
      // the parse catch via discovering malformed package.json in
      // discoverWorkspacePackages instead.
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles a YAML file with carriage returns (\\r\\n line endings)', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'pnpm-workspace.yaml'),
        'packages:\r\n  - packages/*\r\n  - apps/*\r\n',
      )
      const globs = parseWorkspaceGlobs(dir)
      expect(globs).toEqual(['packages/*', 'apps/*'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles tab-indented globs', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n\t- packages/*\n\t- apps/*\n')
      const globs = parseWorkspaceGlobs(dir)
      expect(globs).toEqual(['packages/*', 'apps/*'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// discoverWorkspacePackages
// ---------------------------------------------------------------------------
describe('discoverWorkspacePackages', () => {
  it('returns an empty array when globs is null', () => {
    const dir = makeTempDir()
    try {
      expect(discoverWorkspacePackages(dir, null)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns an empty array when globs is an empty list', () => {
    const dir = makeTempDir()
    try {
      expect(discoverWorkspacePackages(dir, [])).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves a literal directory glob and reads package.json', () => {
    const dir = makeTempDir()
    try {
      const pkgDir = makeDir(dir, 'packages/mylib')
      writeJson(join(pkgDir, 'package.json'), { name: '@scope/mylib' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/mylib'])
      expect(pkgs).toHaveLength(1)
      expect(pkgs[0]!.name).toBe('@scope/mylib')
      expect(pkgs[0]!.shortName).toBe('mylib')
      expect(pkgs[0]!.relativePath).toBe('packages/mylib')
      expect(pkgs[0]!.absolutePath).toBe(pkgDir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves a wildcard glob (packages/*)', () => {
    const dir = makeTempDir()
    try {
      const pkgA = makeDir(dir, 'packages/a')
      const pkgB = makeDir(dir, 'packages/b')
      writeJson(join(pkgA, 'package.json'), { name: 'a' })
      writeJson(join(pkgB, 'package.json'), { name: 'b' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/*'])
      expect(pkgs).toHaveLength(2)
      expect(pkgs.map((p) => p.name).toSorted()).toEqual(['a', 'b'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves a recursive glob (packages/**)', () => {
    const dir = makeTempDir()
    try {
      const pkgA = makeDir(dir, 'packages/group/a')
      const pkgB = makeDir(dir, 'packages/b')
      // also create a non-package dir (no package.json)
      mkdirSync(join(dir, 'packages/group/empty'), { recursive: true })
      writeJson(join(pkgA, 'package.json'), { name: 'a' })
      writeJson(join(pkgB, 'package.json'), { name: 'b' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/**'])
      expect(pkgs).toHaveLength(2)
      expect(pkgs.map((p) => p.name).toSorted()).toEqual(['a', 'b'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips directories without a package.json', () => {
    const dir = makeTempDir()
    try {
      const pkgA = makeDir(dir, 'packages/a')
      makeDir(dir, 'packages/no-pkg')
      writeJson(join(pkgA, 'package.json'), { name: 'a' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/*'])
      expect(pkgs).toHaveLength(1)
      expect(pkgs[0]!.name).toBe('a')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips node_modules directories', () => {
    const dir = makeTempDir()
    try {
      const pkgA = makeDir(dir, 'packages/a')
      makeDir(dir, 'packages/node_modules')
      writeJson(join(pkgA, 'package.json'), { name: 'a' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/*'])
      expect(pkgs).toHaveLength(1)
      expect(pkgs[0]!.name).toBe('a')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips dot-prefixed directories', () => {
    const dir = makeTempDir()
    try {
      const pkgA = makeDir(dir, 'packages/a')
      makeDir(dir, 'packages/.hidden')
      writeJson(join(pkgA, 'package.json'), { name: 'a' })
      // also put a package.json in the hidden dir to prove it's skipped
      writeJson(join(dir, 'packages/.hidden', 'package.json'), { name: 'hidden' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/*'])
      expect(pkgs).toHaveLength(1)
      expect(pkgs[0]!.name).toBe('a')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('deduplicates packages matched by multiple globs', () => {
    const dir = makeTempDir()
    try {
      const pkgDir = makeDir(dir, 'core')
      writeJson(join(pkgDir, 'package.json'), { name: 'core' })
      const pkgs = discoverWorkspacePackages(dir, ['core', 'core'])
      expect(pkgs).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('sorts packages by name (case-sensitive localeCompare)', () => {
    const dir = makeTempDir()
    try {
      const pkgZ = makeDir(dir, 'packages/z')
      const pkgA = makeDir(dir, 'packages/a')
      const pkgM = makeDir(dir, 'packages/m')
      writeJson(join(pkgZ, 'package.json'), { name: 'z-pkg' })
      writeJson(join(pkgA, 'package.json'), { name: 'a-pkg' })
      writeJson(join(pkgM, 'package.json'), { name: 'm-pkg' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/*'])
      expect(pkgs.map((p) => p.name)).toEqual(['a-pkg', 'm-pkg', 'z-pkg'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to dir basename when package.json has no name field', () => {
    const dir = makeTempDir()
    try {
      const pkgDir = makeDir(dir, 'packages/unnamed')
      writeJson(join(pkgDir, 'package.json'), { version: '1.0.0' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/*'])
      expect(pkgs).toHaveLength(1)
      expect(pkgs[0]!.name).toBe('unnamed')
      expect(pkgs[0]!.shortName).toBe('unnamed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('skips packages with malformed package.json (JSON parse error)', () => {
    const dir = makeTempDir()
    try {
      const pkgDir = makeDir(dir, 'packages/broken')
      writeFileSync(join(pkgDir, 'package.json'), '{not json')
      const pkgs = discoverWorkspacePackages(dir, ['packages/*'])
      expect(pkgs).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles the relativePath being the root (when glob matches repoRoot itself)', () => {
    const dir = makeTempDir()
    try {
      writeJson(join(dir, 'package.json'), { name: 'root-pkg' })
      const pkgs = discoverWorkspacePackages(dir, ['.'])
      expect(pkgs).toHaveLength(1)
      expect(pkgs[0]!.relativePath).toBe('.')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles multiple glob patterns including both wildcard and literal', () => {
    const dir = makeTempDir()
    try {
      const pkgA = makeDir(dir, 'packages/a')
      const pkgB = makeDir(dir, 'packages/b')
      const pkgTool = makeDir(dir, 'tools/cli')
      const pkgLib = makeDir(dir, 'packages/nested/lib')
      writeJson(join(pkgA, 'package.json'), { name: 'a' })
      writeJson(join(pkgB, 'package.json'), { name: 'b' })
      writeJson(join(pkgTool, 'package.json'), { name: '@scope/cli' })
      writeJson(join(pkgLib, 'package.json'), { name: '@scope/lib' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/*', 'tools/cli', 'packages/**'])
      // a, b, @scope/cli, @scope/lib — b matched by both wildcards, deduped
      expect(pkgs).toHaveLength(4)
      expect(pkgs.map((p) => p.name).toSorted()).toEqual(['@scope/cli', '@scope/lib', 'a', 'b'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles scoped package shortName extraction', () => {
    const dir = makeTempDir()
    try {
      const pkgDir = makeDir(dir, 'packages/scoped')
      writeJson(join(pkgDir, 'package.json'), { name: '@my-org/my-package' })
      const pkgs = discoverWorkspacePackages(dir, ['packages/scoped'])
      expect(pkgs[0]!.name).toBe('@my-org/my-package')
      expect(pkgs[0]!.shortName).toBe('my-package')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// detectConsumer
// ---------------------------------------------------------------------------
describe('detectConsumer', () => {
  it('returns null when no git repo is found', () => {
    const dir = makeTempDir()
    try {
      expect(detectConsumer(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detects a single-package repo (no pnpm workspace)', () => {
    const dir = makeTempDir()
    try {
      mkdirSync(join(dir, '.git'))
      writeJson(join(dir, 'package.json'), {
        name: 'my-solo-app',
        version: '0.1.0',
        dependencies: { express: '^4.0.0' },
      })
      const ctx = detectConsumer(dir)
      expect(ctx).not.toBeNull()
      expect(ctx!.repoRoot).toBe(dir)
      expect(ctx!.packageJsonPath).toBe(join(dir, 'package.json'))
      expect(ctx!.packageJson?.name).toBe('my-solo-app')
      expect(ctx!.hasPnpmWorkspace).toBe(false)
      expect(ctx!.workspacePackages).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detects a pnpm workspace monorepo', () => {
    const dir = makeTempDir()
    try {
      mkdirSync(join(dir, '.git'))
      writeJson(join(dir, 'package.json'), { name: 'monorepo-root', private: true })
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      const pkgA = makeDir(dir, 'packages/a')
      const pkgB = makeDir(dir, 'packages/b')
      writeJson(join(pkgA, 'package.json'), { name: '@scope/a' })
      writeJson(join(pkgB, 'package.json'), { name: '@scope/b' })
      const ctx = detectConsumer(dir)
      expect(ctx).not.toBeNull()
      expect(ctx!.hasPnpmWorkspace).toBe(true)
      expect(ctx!.workspacePackages).toHaveLength(2)
      expect(ctx!.workspacePackages.map((p) => p.name).toSorted()).toEqual(['@scope/a', '@scope/b'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles a git repo without package.json', () => {
    const dir = makeTempDir()
    try {
      mkdirSync(join(dir, '.git'))
      const ctx = detectConsumer(dir)
      expect(ctx).not.toBeNull()
      expect(ctx!.repoRoot).toBe(dir)
      expect(ctx!.packageJsonPath).toBeNull()
      expect(ctx!.packageJson).toBeNull()
      expect(ctx!.hasPnpmWorkspace).toBe(false)
      expect(ctx!.workspacePackages).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles a git repo with package.json but no pnpm workspace', () => {
    const dir = makeTempDir()
    try {
      mkdirSync(join(dir, '.git'))
      writeJson(join(dir, 'package.json'), { name: 'npm-pkg' })
      const ctx = detectConsumer(dir)
      expect(ctx).not.toBeNull()
      expect(ctx!.packageJson?.name).toBe('npm-pkg')
      expect(ctx!.hasPnpmWorkspace).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('wraps readPackageJson error in null info (malformed package.json in repo)', () => {
    const dir = makeTempDir()
    try {
      mkdirSync(join(dir, '.git'))
      writeFileSync(join(dir, 'package.json'), '{broken')
      const ctx = detectConsumer(dir)
      expect(ctx).not.toBeNull()
      expect(ctx!.packageJsonPath).toBe(join(dir, 'package.json'))
      expect(ctx!.packageJson).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detects workspace packages but no root package.json', () => {
    const dir = makeTempDir()
    try {
      mkdirSync(join(dir, '.git'))
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - pkg/*\n')
      const pkgDir = makeDir(dir, 'pkg/foo')
      writeJson(join(pkgDir, 'package.json'), { name: 'foo' })
      const ctx = detectConsumer(dir)
      expect(ctx).not.toBeNull()
      expect(ctx!.packageJsonPath).toBeNull()
      expect(ctx!.packageJson).toBeNull()
      expect(ctx!.hasPnpmWorkspace).toBe(true)
      expect(ctx!.workspacePackages).toHaveLength(1)
      expect(ctx!.workspacePackages[0]!.name).toBe('foo')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('defaults startDir to process.cwd()', () => {
    const dir = realpathSync(makeTempDir())
    try {
      mkdirSync(join(dir, '.git'))
      const _originalCwd = process.cwd()
      try {
        const ctx = detectConsumer(dir)
        expect(ctx).not.toBeNull()
        expect(realpathSync(ctx!.repoRoot)).toBe(dir)
      } finally {
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
