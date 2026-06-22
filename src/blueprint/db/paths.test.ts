import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mock state — `vi.mock` factory closes over `mockState`.
const mockState = vi.hoisted(() => {
  return { stateRoot: '/tmp/wp-state-root-placeholder' }
})

vi.mock('env-paths', () => ({
  default: () => ({
    data: mockState.stateRoot,
    config: mockState.stateRoot,
    cache: mockState.stateRoot,
    log: mockState.stateRoot,
    temp: mockState.stateRoot,
  }),
}))

import {
  LockTimeoutError,
  acquireMarkdownWriteLock,
  acquireProjectionDbWriteLock,
  resolveBlueprintMarkdownLockPath,
  resolveBlueprintProjectionDbLockPath,
  resolveBlueprintProjectionDbPath,
  withMarkdownWriteLock,
  withProjectionDbWriteLock,
} from './paths.js'
import { _clearCacheForTests } from '#paths/state-root.js'

function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
}

function createSyntheticLinkedWorktree(repo: string, wtDir: string, name: string): void {
  const worktreeGitDir = path.join(repo, '.git', 'worktrees', name)
  mkdirSync(worktreeGitDir, { recursive: true })
  mkdirSync(wtDir, { recursive: true })
  writeFileSync(path.join(wtDir, '.git'), `gitdir: ${worktreeGitDir}\n`)
  writeFileSync(path.join(worktreeGitDir, 'commondir'), '../..\n')
  writeFileSync(path.join(worktreeGitDir, 'gitdir'), `${path.join(wtDir, '.git')}\n`)
  writeFileSync(path.join(worktreeGitDir, 'HEAD'), `ref: refs/heads/${name}\n`)
}

let stateRootDir: string

beforeEach(() => {
  delete process.env.WP_STATE_ROOT
  _clearCacheForTests()
  delete process.env.CLAUDE_PROJECT_DIR
  stateRootDir = mkdtempSync(path.join(tmpdir(), 'wp-state-root-'))
  mockState.stateRoot = stateRootDir
})

afterEach(() => {
  _clearCacheForTests()
  rmSync(stateRootDir, { recursive: true, force: true })
})

describe('resolveBlueprintProjectionDbPath', () => {
  it('returns a repo-scoped path inside a git repo', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    try {
      initGitRepo(repo)
      const dbPath = resolveBlueprintProjectionDbPath(repo)
      expect(dbPath).not.toContain(`${path.sep}worktree${path.sep}`)
      expect(dbPath).toMatch(/blueprints[/\\]blueprints\.db$/)
      expect(dbPath.startsWith(stateRootDir)).toBe(true)
      expect(dbPath.startsWith(repo)).toBe(false)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('returns a deterministic user-state path outside a git repo', () => {
    const nonGit = mkdtempSync(path.join(tmpdir(), 'wp-nogit-'))
    try {
      const dbPath = resolveBlueprintProjectionDbPath(nonGit)
      expect(dbPath.startsWith(stateRootDir)).toBe(true)
      expect(dbPath).toContain(`${path.sep}non-git${path.sep}`)
      expect(dbPath).toMatch(/[/\\]\.blueprints\.db$/)
      expect(dbPath.startsWith(nonGit)).toBe(false)
    } finally {
      rmSync(nonGit, { recursive: true, force: true })
    }
  })

  it('resolves the same projection path for two worktrees of the same repo', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    const wtParent = mkdtempSync(path.join(tmpdir(), 'wp-wt-parent-'))
    const wtDir = path.join(wtParent, 'alt')
    try {
      initGitRepo(repo)
      createSyntheticLinkedWorktree(repo, wtDir, 'alt')

      const dbMain = resolveBlueprintProjectionDbPath(repo)
      _clearCacheForTests()
      const dbAlt = resolveBlueprintProjectionDbPath(wtDir)
      expect(dbMain).toStrictEqual(dbAlt)
    } finally {
      rmSync(wtParent, { recursive: true, force: true })
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('lock-scope policy', () => {
  it('projection DB lock is repo-scoped (sibling to DB)', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    try {
      initGitRepo(repo)
      const dbPath = resolveBlueprintProjectionDbPath(repo)
      const lockPath = resolveBlueprintProjectionDbLockPath(repo)
      expect(path.dirname(lockPath)).toStrictEqual(path.dirname(dbPath))
      expect(lockPath.endsWith('blueprints.db.lock')).toBe(true)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('markdown lock is repo-scoped (no worktree segment)', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    try {
      initGitRepo(repo)
      const mdLock = resolveBlueprintMarkdownLockPath(repo)
      expect(mdLock).not.toContain(`${path.sep}worktree${path.sep}`)
      expect(mdLock.endsWith('markdown.lock')).toBe(true)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('two worktrees share the same markdown lock path', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    const wtParent = mkdtempSync(path.join(tmpdir(), 'wp-wt-parent-'))
    const wtDir = path.join(wtParent, 'alt2')
    try {
      initGitRepo(repo)
      createSyntheticLinkedWorktree(repo, wtDir, 'alt2')

      const mdMain = resolveBlueprintMarkdownLockPath(repo)
      _clearCacheForTests()
      const mdAlt = resolveBlueprintMarkdownLockPath(wtDir)
      expect(mdMain).toStrictEqual(mdAlt)
    } finally {
      rmSync(wtParent, { recursive: true, force: true })
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('write-lock acquisition (no silent escape)', () => {
  it('serializes concurrent projection-DB writers in the same worktree', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    try {
      initGitRepo(repo)

      const order: string[] = []
      const first = withProjectionDbWriteLock(repo, async () => {
        order.push('a-start')
        await new Promise<void>((resolve) => setTimeout(resolve, 60))
        order.push('a-end')
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
      const second = withProjectionDbWriteLock(repo, async () => {
        order.push('b-start')
        order.push('b-end')
      })

      await Promise.all([first, second])
      expect(order).toStrictEqual(['a-start', 'a-end', 'b-start', 'b-end'])
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('serializes cross-worktree markdown writers via the repo-scoped lock', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    const wtParent = mkdtempSync(path.join(tmpdir(), 'wp-wt-parent-'))
    const wtDir = path.join(wtParent, 'mdlock')
    try {
      initGitRepo(repo)
      createSyntheticLinkedWorktree(repo, wtDir, 'mdlock')

      const order: string[] = []
      const first = withMarkdownWriteLock(repo, async () => {
        order.push('main-start')
        await new Promise<void>((resolve) => setTimeout(resolve, 60))
        order.push('main-end')
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
      const second = withMarkdownWriteLock(wtDir, async () => {
        order.push('alt-start')
        order.push('alt-end')
      })
      await Promise.all([first, second])
      expect(order).toStrictEqual(['main-start', 'main-end', 'alt-start', 'alt-end'])
    } finally {
      rmSync(wtParent, { recursive: true, force: true })
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('throws LockTimeoutError instead of silently proceeding when the lock cannot be acquired', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    try {
      initGitRepo(repo)
      const holderRelease = await acquireProjectionDbWriteLock(repo, { timeoutMs: 5_000 })
      try {
        await expect(acquireProjectionDbWriteLock(repo, { timeoutMs: 300 })).rejects.toBeInstanceOf(
          LockTimeoutError,
        )
      } finally {
        await holderRelease()
      }
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('LockTimeoutError carries next_action: reingest_project and the lock path', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    try {
      initGitRepo(repo)
      const expectedLockPath = resolveBlueprintMarkdownLockPath(repo)
      const holderRelease = await acquireMarkdownWriteLock(repo, { timeoutMs: 5_000 })
      let caught: unknown = null
      try {
        await acquireMarkdownWriteLock(repo, { timeoutMs: 200 })
      } catch (err) {
        caught = err
      } finally {
        await holderRelease()
      }
      expect(caught).toBeInstanceOf(LockTimeoutError)
      const typed = caught as LockTimeoutError
      expect(typed.nextAction).toStrictEqual('reingest_project')
      expect(typed.lockPath).toStrictEqual(expectedLockPath)
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('creates parent directories for the lock file on first acquisition', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'wp-repo-'))
    try {
      initGitRepo(repo)
      const lockPath = resolveBlueprintProjectionDbLockPath(repo)
      expect(existsSync(path.dirname(lockPath))).toBe(false)
      await withProjectionDbWriteLock(repo, () => {
        expect(existsSync(path.dirname(lockPath))).toBe(true)
      })
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('non-git lock path lives under the user-state non-git surface', async () => {
    const nonGit = mkdtempSync(path.join(tmpdir(), 'wp-nogit-'))
    try {
      const lockPath = resolveBlueprintProjectionDbLockPath(nonGit)
      expect(lockPath.startsWith(stateRootDir)).toBe(true)
      expect(lockPath).toContain(`${path.sep}non-git${path.sep}`)
      expect(lockPath).toMatch(/[/\\]\.blueprints\.lock$/)
    } finally {
      rmSync(nonGit, { recursive: true, force: true })
    }
  })
})
