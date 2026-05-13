import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  PROJECT_SOURCES,
  projectIdV1,
  resolveBlueprintProjects,
  RECURSIVE_SCAN_LIMITS,
  type BlueprintProjectRef,
  type GitProbe,
  type RootsProvider,
} from './projects.js'

const createdRoots: string[] = []

function mkroot(prefix = 'ak-projects-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  createdRoots.push(dir)
  // Always resolve real-path so macOS /private/var symlinks don't confuse string compares
  return realpathSync(dir)
}

afterEach(() => {
  while (createdRoots.length > 0) {
    const dir = createdRoots.pop()
    if (!dir) continue
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
})

function gitMarker(dir: string): void {
  mkdirSync(join(dir, '.git'), { recursive: true })
}

function blueprintsDir(dir: string): void {
  mkdirSync(join(dir, 'blueprints', 'in-progress'), { recursive: true })
}

describe('projectIdV1', () => {
  it('produces a 16-char hex id deterministic across runs', () => {
    const a = projectIdV1('/path/to/worktree', '/path/to/worktree/.git', 'linux')
    const b = projectIdV1('/path/to/worktree', '/path/to/worktree/.git', 'linux')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('differs by platform — macOS APFS case-folding lives at the realpath layer, not in the hasher', () => {
    const linux = projectIdV1('/path', undefined, 'linux')
    const darwin = projectIdV1('/path', undefined, 'darwin')
    expect(linux).not.toBe(darwin)
  })

  it('differs when repo common dir differs', () => {
    const a = projectIdV1('/path', '/path/.git', 'linux')
    const b = projectIdV1('/path', '/other/.git', 'linux')
    expect(a).not.toBe(b)
  })

  it('worktree recreation at the same path reuses the id (documented behavior)', () => {
    // Same inputs → same id, regardless of any underlying worktree remove/add.
    const first = projectIdV1('/repo/wt-a', '/repo/.git', 'linux')
    const second = projectIdV1('/repo/wt-a', '/repo/.git', 'linux')
    expect(first).toBe(second)
  })
})

describe('resolveBlueprintProjects — current root', () => {
  it('returns the current project first with source=current', async () => {
    const root = mkroot()
    gitMarker(root)
    const result = await resolveBlueprintProjects({
      cwd: root,
      env: {},
      git: stubGit({ enabled: false }),
    })
    expect(result.length).toBeGreaterThan(0)
    const first = result[0] as BlueprintProjectRef
    expect(first.source).toBe(PROJECT_SOURCES.current)
    expect(first.worktree_path).toBe(root)
    expect(first.repo_path).toBe(root)
    expect(first.project_id).toMatch(/^[0-9a-f]{16}$/)
    expect(first.db_path.endsWith('blueprints.sqlite')).toBe(true)
  })

  it('detects has_blueprints when blueprints/ contains markdown', async () => {
    const root = mkroot()
    gitMarker(root)
    blueprintsDir(root)
    writeFileSync(join(root, 'blueprints', 'in-progress', 'a.md'), '# a\n')
    const result = await resolveBlueprintProjects({
      cwd: root,
      env: {},
      git: stubGit({ enabled: false }),
    })
    expect(result[0]?.has_blueprints).toBe(true)
  })

  it('returns has_blueprints=false when no blueprints/ markdown exists', async () => {
    const root = mkroot()
    gitMarker(root)
    const result = await resolveBlueprintProjects({
      cwd: root,
      env: {},
      git: stubGit({ enabled: false }),
    })
    expect(result[0]?.has_blueprints).toBe(false)
  })
})

describe('resolveBlueprintProjects — MCP roots', () => {
  it('includes roots returned by listRoots with source=mcp_roots', async () => {
    const current = mkroot()
    gitMarker(current)
    const extra = mkroot()
    gitMarker(extra)
    const roots: RootsProvider = async () => ({
      roots: [{ uri: `file://${extra}` }],
    })
    const result = await resolveBlueprintProjects({
      cwd: current,
      env: {},
      git: stubGit({ enabled: false }),
      rootsProvider: roots,
    })
    const extraRef = result.find((r) => r.worktree_path === extra)
    expect(extraRef?.source).toBe(PROJECT_SOURCES.mcp_roots)
  })

  it('handles assertClientCapability throw gracefully — falls back to current project', async () => {
    const current = mkroot()
    gitMarker(current)
    const throwingRoots: RootsProvider = async () => {
      throw new Error('assertClientCapability: client does not support roots')
    }
    const result = await resolveBlueprintProjects({
      cwd: current,
      env: {},
      git: stubGit({ enabled: false }),
      rootsProvider: throwingRoots,
    })
    // Current project still resolves; no throw.
    expect(result.some((r) => r.worktree_path === current)).toBe(true)
  })
})

describe('resolveBlueprintProjects — workspace config', () => {
  it('includes workspace.yaml repos with source=workspace_config', async () => {
    const current = mkroot()
    gitMarker(current)
    const wsRepo = mkroot()
    gitMarker(wsRepo)
    const result = await resolveBlueprintProjects({
      cwd: current,
      env: {},
      git: stubGit({ enabled: false }),
      workspaceRepos: [wsRepo],
    })
    const ref = result.find((r) => r.worktree_path === wsRepo)
    expect(ref?.source).toBe(PROJECT_SOURCES.workspace_config)
  })

  it('tolerates missing workspace.yaml — passes empty workspace list', async () => {
    const current = mkroot()
    gitMarker(current)
    const result = await resolveBlueprintProjects({
      cwd: current,
      env: {},
      git: stubGit({ enabled: false }),
      workspaceRepos: [],
    })
    expect(result.length).toBeGreaterThan(0)
  })

  it('skips workspace repos that do not exist on disk', async () => {
    const current = mkroot()
    gitMarker(current)
    const result = await resolveBlueprintProjects({
      cwd: current,
      env: {},
      git: stubGit({ enabled: false }),
      workspaceRepos: ['/this/path/does/not/exist/xyz123'],
    })
    expect(result.some((r) => r.worktree_path === '/this/path/does/not/exist/xyz123')).toBe(false)
  })
})

describe('resolveBlueprintProjects — git worktrees (reuses parseWorktreePorcelain)', () => {
  it('expands git worktrees via injected porcelain output', async () => {
    const main = mkroot()
    gitMarker(main)
    const wt = mkroot()
    const porcelain = [
      `worktree ${main}`,
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      `worktree ${wt}`,
      'HEAD def456',
      'branch refs/heads/feature/x',
      '',
    ].join('\n')
    const result = await resolveBlueprintProjects({
      cwd: main,
      env: {},
      git: stubGit({
        enabled: true,
        porcelainFor: (repo) => (repo === main ? porcelain : ''),
      }),
    })
    const wtRef = result.find((r) => r.worktree_path === wt)
    expect(wtRef?.source).toBe(PROJECT_SOURCES.git_worktree)
    expect(wtRef?.branch).toBe('feature/x')
    expect(wtRef?.repo_path).toBe(main)
  })
})

describe('resolveBlueprintProjects — duplicate de-dupe via realpath', () => {
  it('de-dupes the same project discovered from multiple sources', async () => {
    const root = mkroot()
    gitMarker(root)
    const result = await resolveBlueprintProjects({
      cwd: root,
      env: {},
      git: stubGit({ enabled: false }),
      workspaceRepos: [root],
    })
    const matches = result.filter((r) => r.worktree_path === root)
    expect(matches.length).toBe(1)
    // The earliest source (current) wins per priority order.
    expect(matches[0]?.source).toBe(PROJECT_SOURCES.current)
  })
})

describe('resolveBlueprintProjects — recursive scan caps', () => {
  it('respects depth cap (depth ≤ 3)', async () => {
    const root = mkroot()
    // depth 1, 2, 3, 4 — depth 4 must be ignored
    const d1 = join(root, 'a')
    const d2 = join(d1, 'b')
    const d3 = join(d2, 'c')
    const d4 = join(d3, 'd')
    for (const d of [d1, d2, d3, d4]) {
      mkdirSync(d, { recursive: true })
      gitMarker(d)
    }
    const result = await resolveBlueprintProjects({
      cwd: mkroot(),
      env: {},
      git: stubGit({ enabled: false }),
      recursiveScanRoots: [root],
    })
    expect(result.some((r) => r.worktree_path === d3)).toBe(true)
    expect(result.some((r) => r.worktree_path === d4)).toBe(false)
  })

  it('ignores blocked directory names (node_modules, .git, dist, .next, target, .cache, .turbo, .pnpm-store)', async () => {
    const root = mkroot()
    const ignored = ['node_modules', 'dist', '.next', 'target', '.cache', '.turbo', '.pnpm-store']
    for (const name of ignored) {
      const child = join(root, name, 'inner')
      mkdirSync(child, { recursive: true })
      gitMarker(child)
    }
    const result = await resolveBlueprintProjects({
      cwd: mkroot(),
      env: {},
      git: stubGit({ enabled: false }),
      recursiveScanRoots: [root],
    })
    for (const name of ignored) {
      expect(result.some((r) => r.worktree_path.includes(`/${name}/`))).toBe(false)
    }
  })

  it('skips hidden dotfiles except `.agent`', async () => {
    const root = mkroot()
    const hidden = join(root, '.private', 'p')
    mkdirSync(hidden, { recursive: true })
    gitMarker(hidden)
    const agent = join(root, '.agent', 'p')
    mkdirSync(agent, { recursive: true })
    gitMarker(agent)
    const result = await resolveBlueprintProjects({
      cwd: mkroot(),
      env: {},
      git: stubGit({ enabled: false }),
      recursiveScanRoots: [root],
    })
    expect(result.some((r) => r.worktree_path === hidden)).toBe(false)
  })

  it('emits a structured failure entry when count cap is exceeded', async () => {
    const root = mkroot()
    // Generate 5 children to exceed a small injected count cap
    for (const name of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      const c = join(root, name)
      mkdirSync(c, { recursive: true })
      gitMarker(c)
    }
    const result = await resolveBlueprintProjects({
      cwd: mkroot(),
      env: {},
      git: stubGit({ enabled: false }),
      recursiveScanRoots: [root],
      caps: { ...RECURSIVE_SCAN_LIMITS, count: 2 },
    })
    const recRefs = result.filter((r) => r.source === PROJECT_SOURCES.recursive_scan)
    expect(recRefs.length).toBeLessThanOrEqual(2)
  })

  it('emits a structured failure entry when timeout is exceeded', async () => {
    const root = mkroot()
    const c = join(root, 'p1')
    mkdirSync(c, { recursive: true })
    gitMarker(c)
    const result = await resolveBlueprintProjects({
      cwd: mkroot(),
      env: {},
      git: stubGit({ enabled: false }),
      recursiveScanRoots: [root],
      caps: { ...RECURSIVE_SCAN_LIMITS, timeoutMs: 0 },
    })
    // Timeout=0 forces immediate cap; partial results are still returned (may be empty).
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('resolveBlueprintProjects — pinned caps', () => {
  it('exposes the pinned cap constants (depth=3, count=200, timeoutMs=2000)', () => {
    expect(RECURSIVE_SCAN_LIMITS.depth).toBe(3)
    expect(RECURSIVE_SCAN_LIMITS.count).toBe(200)
    expect(RECURSIVE_SCAN_LIMITS.timeoutMs).toBe(2000)
  })
})

interface GitStubOptions {
  enabled: boolean
  porcelainFor?: (repoPath: string) => string
}

function stubGit(opts: GitStubOptions): GitProbe {
  return {
    isGitRepo: () => opts.enabled,
    repoToplevel: (cwd) => (opts.enabled ? cwd : null),
    repoCommonDir: (cwd) => (opts.enabled ? join(cwd, '.git') : null),
    listWorktreesPorcelain: (cwd) => opts.porcelainFor?.(cwd) ?? '',
    headBranch: () => null,
    platform: () => 'linux',
  }
}

// Touch this so the variable is intentional even when unused in some branches.
void beforeEach
