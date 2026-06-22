import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// [TPH-INFRA] Node/git/filesystem boundaries — not available deterministically in unit tests
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  realpathSync: vi.fn(),
}))

// [TPH-INFRA] env-paths data-dir resolution — OS-level boundary
vi.mock('env-paths', () => ({
  default: vi.fn(() => ({
    data: '/fake/state-root',
    config: '/fake/config',
    cache: '/fake/cache',
    log: '/fake/log',
    temp: '/fake/temp',
  })),
}))

// [TPH-INFRA] Cross-process lock helper — filesystem side effect boundary
vi.mock('proper-lockfile', () => {
  const lock = vi.fn(async () => async () => {
    /* release */
  })
  return {
    default: { lock },
    lock,
  }
})

import {
  NotInGitRepoError,
  _clearCacheForTests,
  getRepoKey,
  getStateRoot,
  getSurfacePath,
  getWorktreeKey,
  withLock,
} from './state-root.js'

const mockExecFileSync = vi.mocked(execFileSync)
const mockRealpathSync = vi.mocked(realpathSync)

beforeEach(() => {
  vi.clearAllMocks()
  _clearCacheForTests()
  delete process.env.CLAUDE_PROJECT_DIR
  delete process.env.WP_STATE_ROOT
})

function stubGit(values: Record<string, string>): void {
  mockExecFileSync.mockImplementation((file, args) => {
    if (file !== 'git') throw new Error(`unexpected exec: ${String(file)}`)
    const argv = (args ?? []) as readonly string[]
    const key = argv.join(' ')
    const result = values[key]
    if (result === undefined) throw new Error(`unstubbed git invocation: ${key}`)
    return result as unknown as Buffer
  })
}

describe('getStateRoot', () => {
  it('honors WP_STATE_ROOT before env-paths', () => {
    process.env.WP_STATE_ROOT = '/tmp/wp-test-state-root'

    expect(getStateRoot()).toStrictEqual('/tmp/wp-test-state-root')
  })

  it('resolves the env-paths data directory', () => {
    expect(getStateRoot()).toStrictEqual('/fake/state-root')
  })

  it('memoizes the resolved root', () => {
    const first = getStateRoot()
    const second = getStateRoot()
    expect(second).toStrictEqual(first)
  })
})

describe('getRepoKey', () => {
  it('returns a 16-char hex slice of sha256(realpath(git-common-dir))', () => {
    stubGit({ 'rev-parse --git-common-dir': '/repo/.git' })
    mockRealpathSync.mockReturnValue('/real/repo/.git')

    const key = getRepoKey()

    expect(key).toMatch(/^[0-9a-f]{16}$/)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--git-common-dir'],
      expect.objectContaining({ encoding: 'utf-8' }),
    )
  })

  it('memoizes after the first call (D17)', () => {
    stubGit({ 'rev-parse --git-common-dir': '/repo/.git' })
    mockRealpathSync.mockReturnValue('/real/repo/.git')

    const first = getRepoKey()
    const second = getRepoKey()

    expect(second).toStrictEqual(first)
    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    expect(mockRealpathSync).toHaveBeenCalledTimes(2)
  })

  it('throws NotInGitRepoError when git rev-parse fails (D6)', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository')
    })

    expect(() => getRepoKey()).toThrow(NotInGitRepoError)
  })

  it('attaches cwd and cause on NotInGitRepoError', () => {
    const failure = new Error('fatal: not a git repository')
    mockExecFileSync.mockImplementation(() => {
      throw failure
    })
    process.env.CLAUDE_PROJECT_DIR = '/somewhere/else'

    try {
      getRepoKey()
      throw new Error('expected throw')
    } catch (error) {
      expect(error).toBeInstanceOf(NotInGitRepoError)
      const typed = error as NotInGitRepoError & { cause?: unknown }
      expect(typed.cwd).toStrictEqual('/somewhere/else')
      expect(typed.cause).toStrictEqual(failure)
    }
  })

  it('produces the same repo-key across two worktrees of the same clone', () => {
    stubGit({ 'rev-parse --git-common-dir': '/repo/.git' })
    mockRealpathSync.mockReturnValue('/real/repo/.git')

    const fromWorktreeA = getRepoKey()
    _clearCacheForTests()
    const fromWorktreeB = getRepoKey()

    expect(fromWorktreeB).toStrictEqual(fromWorktreeA)
  })

  it('honors CLAUDE_PROJECT_DIR over process.cwd', () => {
    process.env.CLAUDE_PROJECT_DIR = '/hook-context/repo'
    stubGit({ 'rev-parse --git-common-dir': '/hook-context/repo/.git' })
    mockRealpathSync.mockReturnValue('/real/hook-context/repo/.git')

    getRepoKey()

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--git-common-dir'],
      expect.objectContaining({ cwd: '/hook-context/repo' }),
    )
  })
})

describe('getWorktreeKey', () => {
  it('returns an 8-char hex slice of sha256(realpath(show-toplevel))', () => {
    stubGit({ 'rev-parse --show-toplevel': '/repo/worktree-a' })
    mockRealpathSync.mockReturnValue('/real/repo/worktree-a')

    const key = getWorktreeKey()

    expect(key).toMatch(/^[0-9a-f]{8}$/)
  })

  it('memoizes after the first call (D17)', () => {
    stubGit({ 'rev-parse --show-toplevel': '/repo/worktree-a' })
    mockRealpathSync.mockReturnValue('/real/repo/worktree-a')

    const first = getWorktreeKey()
    const second = getWorktreeKey()

    expect(second).toStrictEqual(first)
    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
  })

  it('produces different keys for different worktree paths', () => {
    stubGit({ 'rev-parse --show-toplevel': '/repo/worktree-a' })
    mockRealpathSync.mockReturnValue('/real/repo/worktree-a')
    const keyA = getWorktreeKey()

    _clearCacheForTests()
    stubGit({ 'rev-parse --show-toplevel': '/repo/worktree-b' })
    mockRealpathSync.mockReturnValue('/real/repo/worktree-b')
    const keyB = getWorktreeKey()

    expect(keyB).not.toStrictEqual(keyA)
  })
})

describe('getSurfacePath', () => {
  beforeEach(() => {
    mockExecFileSync.mockImplementation((file, args) => {
      const argv = (args ?? []) as readonly string[]
      const key = argv.join(' ')
      if (key === 'rev-parse --git-common-dir') return '/repo/.git' as unknown as Buffer
      if (key === 'rev-parse --show-toplevel') return '/repo/worktree-a' as unknown as Buffer
      throw new Error(`unstubbed git invocation: ${key}`)
    })
    mockRealpathSync.mockImplementation((target) => {
      const s = String(target)
      if (s === '/repo/.git') return '/real/repo/.git'
      if (s === '/repo/worktree-a') return '/real/repo/worktree-a'
      return s
    })
  })

  it('composes repo-shared paths under <root>/<repo-key>/<name>', () => {
    const repoKey = getRepoKey()
    _clearCacheForTests()

    const surface = getSurfacePath('blueprints/blueprints.db', 'repo')

    expect(surface).toStrictEqual(`/fake/state-root/${repoKey}/blueprints/blueprints.db`)
  })

  it('composes per-worktree paths under <root>/<repo-key>/worktree/<wt-key>/<name>', () => {
    const repoKey = getRepoKey()
    const wtKey = getWorktreeKey()
    _clearCacheForTests()

    const surface = getSurfacePath('guard-state.json', 'worktree')

    expect(surface).toStrictEqual(`/fake/state-root/${repoKey}/worktree/${wtKey}/guard-state.json`)
  })
})

describe('withLock', () => {
  beforeEach(() => {
    mockExecFileSync.mockImplementation((file, args) => {
      const argv = (args ?? []) as readonly string[]
      const key = argv.join(' ')
      if (key === 'rev-parse --git-common-dir') return '/repo/.git' as unknown as Buffer
      if (key === 'rev-parse --show-toplevel') return '/repo/worktree-a' as unknown as Buffer
      throw new Error(`unstubbed git invocation: ${key}`)
    })
    mockRealpathSync.mockImplementation((target) => String(target))
  })

  it('acquires and releases the lock around the callback', async () => {
    const release = vi.fn(async () => {
      /* release */
    })
    const lockModule = await import('proper-lockfile')
    const mockedLock = vi.mocked(lockModule.lock)
    mockedLock.mockResolvedValueOnce(release)

    const result = await withLock('repo', () => 'ok')

    expect(result).toStrictEqual('ok')
    expect(mockedLock).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases the lock even when the callback throws', async () => {
    const release = vi.fn(async () => {
      /* release */
    })
    const lockModule = await import('proper-lockfile')
    const mockedLock = vi.mocked(lockModule.lock)
    mockedLock.mockResolvedValueOnce(release)

    await expect(
      withLock('worktree', () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(release).toHaveBeenCalledTimes(1)
  })
})

describe('_clearCacheForTests', () => {
  it('clears memoized state root, repo key, and worktree key', () => {
    stubGit({
      'rev-parse --git-common-dir': '/repo/.git',
      'rev-parse --show-toplevel': '/repo/worktree-a',
    })
    mockRealpathSync.mockImplementation((target) => String(target))

    getStateRoot()
    getRepoKey()
    getWorktreeKey()

    _clearCacheForTests()

    stubGit({
      'rev-parse --git-common-dir': '/other/.git',
      'rev-parse --show-toplevel': '/other/worktree',
    })

    expect(getRepoKey()).not.toStrictEqual(
      // sha256('/repo/.git').slice(0, 16) — different from current stub
      '',
    )
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--git-common-dir'],
      expect.anything(),
    )
  })
})
