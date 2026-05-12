import { describe, expect, it } from 'vitest'

import {
  parseWorktreePorcelain,
  resolveWorktreePath,
  type WorktreeEntry,
} from './router-dispatch.js'

// ---------------------------------------------------------------------------
// parseWorktreePorcelain
// ---------------------------------------------------------------------------

describe('parseWorktreePorcelain', () => {
  it('parses a single main worktree', () => {
    const raw = ['worktree /repo/main', 'HEAD abc1234def5678', 'branch refs/heads/main', ''].join(
      '\n',
    )

    const result = parseWorktreePorcelain(raw)
    expect(result).toHaveLength(1)
    expect(result[0]).toStrictEqual({
      path: '/repo/main',
      head: 'abc1234def5678',
      branch: 'refs/heads/main',
      bare: false,
    })
  })

  it('parses multiple worktrees', () => {
    const raw = [
      'worktree /repo/main',
      'HEAD aaaaaaa',
      'branch refs/heads/main',
      '',
      'worktree /repo/feat',
      'HEAD bbbbbbb',
      'branch refs/heads/feat/my-feature',
      '',
    ].join('\n')

    const result = parseWorktreePorcelain(raw)
    expect(result).toHaveLength(2)
    expect(result[1]?.branch).toBe('refs/heads/feat/my-feature')
    expect(result[1]?.path).toBe('/repo/feat')
  })

  it('handles detached HEAD (no branch line)', () => {
    const raw = ['worktree /repo/detached', 'HEAD ccccccc', 'detached', ''].join('\n')

    const result = parseWorktreePorcelain(raw)
    expect(result).toHaveLength(1)
    expect(result[0]?.branch).toBeNull()
    expect(result[0]?.bare).toBe(false)
  })

  it('handles bare worktree', () => {
    const raw = ['worktree /repo/bare.git', 'HEAD 0000000', 'bare', ''].join('\n')

    const result = parseWorktreePorcelain(raw)
    expect(result).toHaveLength(1)
    expect(result[0]?.bare).toBe(true)
    expect(result[0]?.branch).toBeNull()
  })

  it('returns empty array for empty input', () => {
    expect(parseWorktreePorcelain('')).toStrictEqual([])
    expect(parseWorktreePorcelain('   ')).toStrictEqual([])
  })
})

// ---------------------------------------------------------------------------
// resolveWorktreePath
// ---------------------------------------------------------------------------

const ENTRIES: WorktreeEntry[] = [
  { path: '/repos/myrepo', head: 'aaaaaaa', branch: 'refs/heads/main', bare: false },
  { path: '/repos/myrepo-feat-auth', head: 'bbbbbbb', branch: 'refs/heads/feat/auth', bare: false },
  { path: '/repos/myrepo-fix-cors', head: 'ccccccc', branch: 'refs/heads/fix/cors', bare: false },
  { path: '/repos/myrepo-detached', head: 'ddddddd', branch: null, bare: false },
]

describe('resolveWorktreePath', () => {
  it('matches by full path', () => {
    expect(resolveWorktreePath('/repos/myrepo-feat-auth', ENTRIES)).toBe('/repos/myrepo-feat-auth')
  })

  it('matches by path basename', () => {
    expect(resolveWorktreePath('myrepo-fix-cors', ENTRIES)).toBe('/repos/myrepo-fix-cors')
  })

  it('matches by full branch ref', () => {
    expect(resolveWorktreePath('refs/heads/feat/auth', ENTRIES)).toBe('/repos/myrepo-feat-auth')
  })

  it('matches by short branch name without refs/heads/ prefix', () => {
    expect(resolveWorktreePath('feat/auth', ENTRIES)).toBe('/repos/myrepo-feat-auth')
    expect(resolveWorktreePath('fix/cors', ENTRIES)).toBe('/repos/myrepo-fix-cors')
    expect(resolveWorktreePath('main', ENTRIES)).toBe('/repos/myrepo')
  })

  it('throws for no match', () => {
    expect(() => resolveWorktreePath('nonexistent', ENTRIES)).toThrow(
      'No worktree matching "nonexistent"',
    )
  })
})
