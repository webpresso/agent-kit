/**
 * Concurrent-ingest integration test for Task 1.1.
 *
 * Demonstrates the two-lock policy in action:
 *  - Same worktree: two concurrent ingest paths serialize via the
 *    `'worktree'`-scoped projection-DB lock.
 *  - Cross-worktree: two concurrent markdown writers (one per worktree)
 *    serialize via the `'repo'`-scoped markdown lock; the projection DBs
 *    themselves are independent so each ingest path runs against its own DB.
 *
 * The serialization signal is the temporal **non-overlap** of the critical
 * sections under each lock, not the final row count (we are not testing DB
 * semantics here — that is covered by ingester.test.ts).
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({ stateRoot: '/tmp/ak-state-root-placeholder' }))

vi.mock('env-paths', () => ({
  default: () => ({
    data: mockState.stateRoot,
    config: mockState.stateRoot,
    cache: mockState.stateRoot,
    log: mockState.stateRoot,
    temp: mockState.stateRoot,
  }),
}))

import { withMarkdownWriteLock, withProjectionDbWriteLock } from './paths.js'
import { _clearCacheForTests } from '#paths/state-root.js'

function initGitRepo(dir: string): void {
  execSync('git init -q', { cwd: dir })
  execSync('git config user.email test@test.local', { cwd: dir })
  execSync('git config user.name test', { cwd: dir })
}

function writeBlueprintFixture(repoDir: string, slug: string): void {
  const bpDir = path.join(repoDir, 'blueprints', 'planned', slug)
  mkdirSync(bpDir, { recursive: true })
  writeFileSync(
    path.join(bpDir, '_overview.md'),
    `---
type: blueprint
status: planned
complexity: S
owner: tester
created: '2026-01-01'
last_updated: '2026-01-01'
tags: []
depends_on: []
---

# ${slug}

#### Task 1.1: stub
**Status:** todo
`,
  )
}

interface Span {
  readonly label: string
  readonly start: number
  readonly end: number
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end
}

let stateRootDir: string

beforeEach(() => {
  _clearCacheForTests()
  stateRootDir = mkdtempSync(path.join(tmpdir(), 'ak-state-root-'))
  mockState.stateRoot = stateRootDir
})

afterEach(() => {
  _clearCacheForTests()
  rmSync(stateRootDir, { recursive: true, force: true })
})

describe('concurrent ingest — projection DB lock (worktree scope)', () => {
  it('two ingest paths in the same worktree serialize via the projection lock', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ak-repo-'))
    try {
      initGitRepo(repo)
      writeBlueprintFixture(repo, 'fixture-a')

      const spans: Span[] = []
      const runOne = async (label: string): Promise<void> => {
        await withProjectionDbWriteLock(repo, async () => {
          const start = performance.now()
          // Simulate ingest work — non-trivial duration so overlap would be
          // detectable if the lock did not serialize.
          await new Promise<void>((resolve) => setTimeout(resolve, 60))
          spans.push({ label, start, end: performance.now() })
        })
      }

      await Promise.all([runOne('A'), runOne('B')])

      expect(spans).toHaveLength(2)
      const [first, second] = spans[0]!.start < spans[1]!.start
        ? [spans[0]!, spans[1]!]
        : [spans[1]!, spans[0]!]
      expect(overlaps(first, second)).toBe(false)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('concurrent ingest — markdown lock (repo scope, cross-worktree)', () => {
  it('two ingest paths in different worktrees of the same repo serialize via the markdown lock', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ak-repo-'))
    const wtParent = mkdtempSync(path.join(tmpdir(), 'ak-wt-parent-'))
    const wtDir = path.join(wtParent, 'alt')
    try {
      initGitRepo(repo)
      writeBlueprintFixture(repo, 'fixture-a')
      execSync('git add . && git commit -q -m init', { cwd: repo })
      execSync(`git worktree add -q -b alt-wt "${wtDir}"`, { cwd: repo })

      // Now both `repo` and `wtDir` are valid worktrees of the same repo.
      // Their markdown lock paths are equal (repo-scoped); their projection
      // DBs are distinct (worktree-scoped).
      const spans: Span[] = []
      const runOne = async (label: string, cwd: string): Promise<void> => {
        await withMarkdownWriteLock(cwd, async () => {
          const start = performance.now()
          await new Promise<void>((resolve) => setTimeout(resolve, 60))
          spans.push({ label, start, end: performance.now() })
        })
      }

      await Promise.all([runOne('main', repo), runOne('alt', wtDir)])

      expect(spans).toHaveLength(2)
      const [first, second] = spans[0]!.start < spans[1]!.start
        ? [spans[0]!, spans[1]!]
        : [spans[1]!, spans[0]!]
      expect(overlaps(first, second)).toBe(false)
    } finally {
      try {
        execSync(`git worktree remove --force "${wtDir}"`, { cwd: repo })
      } catch {
        /* best effort */
      }
      rmSync(wtParent, { recursive: true, force: true })
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('cross-worktree projection DBs do not contend on the same lock', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ak-repo-'))
    const wtParent = mkdtempSync(path.join(tmpdir(), 'ak-wt-parent-'))
    const wtDir = path.join(wtParent, 'alt')
    try {
      initGitRepo(repo)
      writeBlueprintFixture(repo, 'fixture-a')
      execSync('git add . && git commit -q -m init', { cwd: repo })
      execSync(`git worktree add -q -b alt-wt2 "${wtDir}"`, { cwd: repo })

      const spans: Span[] = []
      const runOne = async (label: string, cwd: string): Promise<void> => {
        await withProjectionDbWriteLock(cwd, async () => {
          const start = performance.now()
          await new Promise<void>((resolve) => setTimeout(resolve, 60))
          spans.push({ label, start, end: performance.now() })
        })
      }

      const t0 = performance.now()
      await Promise.all([runOne('main', repo), runOne('alt', wtDir)])
      const totalMs = performance.now() - t0

      // Two 60ms critical sections running in parallel should finish in ~70ms,
      // not 120ms+. Pick a forgiving cap to avoid flakes on slow CI hosts.
      expect(totalMs).toBeLessThan(110)
      expect(spans).toHaveLength(2)
    } finally {
      try {
        execSync(`git worktree remove --force "${wtDir}"`, { cwd: repo })
      } catch {
        /* best effort */
      }
      rmSync(wtParent, { recursive: true, force: true })
      rmSync(repo, { recursive: true, force: true })
    }
  })
})
