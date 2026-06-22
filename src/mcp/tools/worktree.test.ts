import { afterEach, describe, expect, it, vi } from 'vitest'

const spawnSyncMock = vi.hoisted(() => vi.fn())
const execFileSyncMock = vi.hoisted(() => vi.fn())
const existsSyncMock = vi.hoisted(() => vi.fn())
const upsertMock = vi.hoisted(() => vi.fn())
const removeRegistryMock = vi.hoisted(() => vi.fn())
const pruneMock = vi.hoisted(() => vi.fn())
const readRegistryMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
  execFileSync: execFileSyncMock,
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: existsSyncMock }
})

vi.mock('#cli/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#cli/utils')>()
  return { ...actual, getProjectRoot: () => '/repo/main' }
})

vi.mock('#worktrees/manager.js', () => ({
  readRepoOriginUrl: () => 'https://github.com/webpresso/agent-kit.git',
  repoManagedRoot: () =>
    '/home/alice/.agent/worktrees/repos/github.com-webpresso-agent-kit-296ec9af45',
}))

vi.mock('#worktrees/registry.js', () => ({
  pruneStaleWorktreeRegistryEntries: pruneMock,
  readWorktreeRegistry: readRegistryMock,
  removeWorktreeRegistryEntries: removeRegistryMock,
  upsertWorktreeRegistryEntry: upsertMock,
}))

import wpWorktreeTool from './worktree.js'

const PORCELAIN = [
  'worktree /repo/main',
  'HEAD aaaaaaa',
  'branch refs/heads/main',
  '',
  'worktree /home/alice/.agent/worktrees/repos/github.com-webpresso-agent-kit-296ec9af45/feat-auth',
  'HEAD bbbbbbb',
  'branch refs/heads/feat/auth',
  '',
].join('\n')

const PORCELAIN_WITH_UNMANAGED = [
  PORCELAIN,
  '',
  'worktree /tmp/manual-agent-kit-worktree',
  'HEAD ccccccc',
  'branch refs/heads/feat/manual',
  '',
].join('\n')

function payload(result: Awaited<ReturnType<typeof wpWorktreeTool.handler>>) {
  return result.structuredContent as Record<string, unknown>
}

function spawnResult(status = 0, stdout = '', stderr = '') {
  return { status, stdout, stderr }
}

afterEach(() => {
  spawnSyncMock.mockReset()
  execFileSyncMock.mockReset()
  existsSyncMock.mockReset()
  upsertMock.mockReset()
  removeRegistryMock.mockReset()
  pruneMock.mockReset()
  readRegistryMock.mockReset()
})

describe('wp_worktree tool', () => {
  it('exposes the expected descriptor surface', () => {
    expect(wpWorktreeTool.name).toBe('wp_worktree')
    expect(wpWorktreeTool.annotations?.readOnlyHint).toBe(false)
    expect(wpWorktreeTool.annotations?.idempotentHint).toBe(false)
  })

  it('lists worktrees without execute', async () => {
    execFileSyncMock.mockReturnValue(PORCELAIN)

    const result = await wpWorktreeTool.handler({ action: 'list' })
    expect(payload(result)).toMatchObject({
      passed: true,
      action: 'list',
      executed: false,
      worktrees: [
        { path: '/repo/main', branch: 'main', head: 'aaaaaaa' },
        {
          path: '/home/alice/.agent/worktrees/repos/github.com-webpresso-agent-kit-296ec9af45/feat-auth',
          branch: 'feat/auth',
          head: 'bbbbbbb',
        },
      ],
    })
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it('requires execute:true for mutating actions', async () => {
    const result = await wpWorktreeTool.handler({ action: 'new', branch: 'feat/auth' })

    expect(payload(result)).toMatchObject({
      passed: false,
      action: 'new',
      executed: false,
      warnings: ['execute_required'],
    })
    expect(result.isError).toBe(true)
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it('refuses branch/path collisions before creating a worktree', async () => {
    execFileSyncMock.mockReturnValue(PORCELAIN)
    existsSyncMock.mockReturnValue(false)
    spawnSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'show-ref') return spawnResult(0)
      return spawnResult(1, '', 'unexpected')
    })

    const result = await wpWorktreeTool.handler({
      action: 'new',
      branch: 'feat/auth',
      execute: true,
    })

    expect(payload(result)).toMatchObject({
      passed: false,
      action: 'new',
      executed: false,
      warnings: ['collision_or_invalid_target'],
    })
    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
    expect(spawnSyncMock.mock.calls[0]?.[1]).toEqual([
      'show-ref',
      '--verify',
      '--quiet',
      'refs/heads/feat/auth',
    ])
  })

  it('creates a worktree with explicit execute and baseRef', async () => {
    execFileSyncMock.mockReturnValue(PORCELAIN)
    existsSyncMock.mockReturnValue(false)
    spawnSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'show-ref') return spawnResult(1)
      if (args[0] === 'worktree' && args[1] === 'add') return spawnResult(0, 'ok')
      return spawnResult(0)
    })

    const result = await wpWorktreeTool.handler({
      action: 'new',
      branch: 'feat/new-tool',
      baseRef: 'HEAD',
      execute: true,
    })

    expect(payload(result)).toMatchObject({
      passed: true,
      action: 'new',
      executed: true,
      created: { branch: 'feat/new-tool', baseRef: 'HEAD' },
    })
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining([
        'worktree',
        'add',
        '-b',
        'feat/new-tool',
        expect.any(String),
        'HEAD',
      ]),
      expect.objectContaining({ cwd: '/repo/main' }),
    )
  })

  it('refuses to remove dirty worktrees', async () => {
    execFileSyncMock.mockReturnValue(PORCELAIN)
    readRegistryMock.mockReturnValue({
      version: 1,
      entries: [
        {
          id: 'git-agent-kit-feat-auth',
          repoNamespace: 'github.com-webpresso-agent-kit-296ec9af45',
          repoRoot: '/repo/main',
          kind: 'owner',
          path: '/home/alice/.agent/worktrees/repos/github.com-webpresso-agent-kit-296ec9af45/feat-auth',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
        },
      ],
    })
    spawnSyncMock.mockReturnValue(spawnResult(0, ' M file.ts\n'))

    const result = await wpWorktreeTool.handler({
      action: 'remove',
      branch: 'feat/auth',
      execute: true,
    })

    expect(payload(result)).toMatchObject({
      passed: false,
      action: 'remove',
      executed: false,
      warnings: ['dirty_worktree'],
    })
    expect(spawnSyncMock).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain'],
      expect.objectContaining({
        cwd: '/home/alice/.agent/worktrees/repos/github.com-webpresso-agent-kit-296ec9af45/feat-auth',
      }),
    )
    expect(removeRegistryMock).not.toHaveBeenCalled()
  })

  it('removes a clean unlocked worktree and updates the registry', async () => {
    execFileSyncMock.mockReturnValue(PORCELAIN)
    readRegistryMock.mockReturnValue({
      version: 1,
      entries: [
        {
          id: 'git-agent-kit-feat-auth',
          repoNamespace: 'github.com-webpresso-agent-kit-296ec9af45',
          repoRoot: '/repo/main',
          kind: 'owner',
          path: '/home/alice/.agent/worktrees/repos/github.com-webpresso-agent-kit-296ec9af45/feat-auth',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
        },
      ],
    })
    spawnSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'status') return spawnResult(0, '')
      if (args[0] === 'worktree' && args[1] === 'remove') return spawnResult(0, '')
      return spawnResult(0)
    })

    const result = await wpWorktreeTool.handler({
      action: 'remove',
      branch: 'feat/auth',
      execute: true,
    })

    expect(payload(result)).toMatchObject({
      passed: true,
      action: 'remove',
      executed: true,
      removed: {
        path: '/home/alice/.agent/worktrees/repos/github.com-webpresso-agent-kit-296ec9af45/feat-auth',
        branch: 'feat/auth',
      },
    })
    expect(removeRegistryMock).toHaveBeenCalledOnce()
  })

  it('refuses to remove git worktrees outside the managed registry scope', async () => {
    execFileSyncMock.mockReturnValue(PORCELAIN_WITH_UNMANAGED)
    readRegistryMock.mockReturnValue({ version: 1, entries: [] })

    const result = await wpWorktreeTool.handler({
      action: 'remove',
      branch: 'feat/manual',
      execute: true,
    })
    expect(payload(result)).toMatchObject({
      passed: false,
      action: 'remove',
      executed: false,
      warnings: ['unmanaged_worktree_protected'],
    })
    expect(spawnSyncMock).not.toHaveBeenCalled()
    expect(removeRegistryMock).not.toHaveBeenCalled()
  })

  it('prunes only stale registry entries for the current repo root', async () => {
    removeRegistryMock.mockReturnValue([{ id: 'stale' }])
    existsSyncMock.mockImplementation((path: string) => path !== '/missing/current')

    const result = await wpWorktreeTool.handler({ action: 'prune', execute: true })

    expect(payload(result)).toMatchObject({
      passed: true,
      action: 'prune',
      executed: true,
      summary: 'Pruned 1 stale managed registry entry',
    })
    const predicate = removeRegistryMock.mock.calls[0]?.[0] as (entry: {
      repoNamespace: string
      repoRoot: string
      path: string
    }) => boolean
    expect(
      predicate({
        repoNamespace: 'github.com-webpresso-agent-kit-296ec9af45',
        repoRoot: '/repo/main',
        path: '/missing/current',
      }),
    ).toBe(true)
    expect(
      predicate({
        repoNamespace: 'github.com-webpresso-agent-kit-296ec9af45',
        repoRoot: '/other/clone',
        path: '/missing/other-clone',
      }),
    ).toBe(false)
    expect(
      predicate({
        repoNamespace: 'other-repo',
        repoRoot: '/repo/main',
        path: '/missing/other',
      }),
    ).toBe(false)
    expect(
      predicate({
        repoNamespace: 'github.com-webpresso-agent-kit-296ec9af45',
        repoRoot: '/repo/main',
        path: '/present/current',
      }),
    ).toBe(false)
  })
})
