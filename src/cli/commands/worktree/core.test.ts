import { describe, expect, it } from 'vitest'

import {
  formatWorktreeList,
  parseWorktreePorcelain,
  resolveNewWorktreeTarget,
  resolveWorktreePath,
  sanitizeWorktreeSegment,
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

// ---------------------------------------------------------------------------
// formatWorktreeList
// ---------------------------------------------------------------------------

describe('formatWorktreeList', () => {
  it('marks the resolved current worktree root instead of the shell cwd', () => {
    expect(formatWorktreeList(ENTRIES, '/repos/myrepo-feat-auth')).toStrictEqual([
      '  PATH                     BRANCH      HEAD',
      '  -----------------------  ----------  -------',
      '  /repos/myrepo            main        aaaaaaa',
      '* /repos/myrepo-feat-auth  feat/auth   bbbbbbb',
      '  /repos/myrepo-fix-cors   fix/cors    ccccccc',
      '  /repos/myrepo-detached   (detached)  ddddddd',
    ])
  })
})

// ---------------------------------------------------------------------------
// resolveNewWorktreeTarget
// ---------------------------------------------------------------------------

describe('resolveNewWorktreeTarget', () => {
  it('generates a branch and sibling path when no branch is provided', () => {
    const target = resolveNewWorktreeTarget({
      repoRoot: '/repos/agent-kit',
      now: new Date('2026-05-13T14:27:00'),
      randomSuffix: () => 'x9k',
      existingEntries: [],
      branchExists: () => false,
    })

    expect(target).toStrictEqual({
      branch: 'agent/2026-05-13-1427-x9k',
      path: '/repos/agent-kit-agent-2026-05-13-1427-x9k',
      generated: true,
    })
  })

  it('uses --name as a human-friendly branch slug with the default prefix', () => {
    const target = resolveNewWorktreeTarget({
      name: 'Fix Login Flow',
      repoRoot: '/repos/agent-kit',
      now: new Date('2026-05-13T14:27:00'),
      randomSuffix: () => 'unused',
      existingEntries: [],
      branchExists: () => false,
    })

    expect(target).toStrictEqual({
      branch: 'agent/fix-login-flow',
      path: '/repos/agent-kit-agent-fix-login-flow',
      generated: true,
    })
  })

  it('honors --prefix for generated branches', () => {
    const target = resolveNewWorktreeTarget({
      prefix: 'ralph',
      repoRoot: '/repos/agent-kit',
      now: new Date('2026-05-13T14:27:00'),
      randomSuffix: () => 'q2w',
      existingEntries: [],
      branchExists: () => false,
    })

    expect(target.branch).toBe('ralph/2026-05-13-1427-q2w')
    expect(target.path).toBe('/repos/agent-kit-ralph-2026-05-13-1427-q2w')
  })

  it('retries generated names when the branch or default path collides', () => {
    const suffixes = ['aaa', 'bbb']
    const target = resolveNewWorktreeTarget({
      repoRoot: '/repos/agent-kit',
      now: new Date('2026-05-13T14:27:00'),
      randomSuffix: () => suffixes.shift() ?? 'ccc',
      existingEntries: [
        {
          path: '/repos/agent-kit-agent-2026-05-13-1427-aaa',
          head: 'abc',
          branch: null,
          bare: false,
        },
      ],
      branchExists: (branch) => branch === 'agent/2026-05-13-1427-aaa',
    })

    expect(target).toStrictEqual({
      branch: 'agent/2026-05-13-1427-bbb',
      path: '/repos/agent-kit-agent-2026-05-13-1427-bbb',
      generated: true,
    })
  })

  it('retries --name targets when the friendly branch already exists', () => {
    const target = resolveNewWorktreeTarget({
      name: 'Fix Login Flow',
      repoRoot: '/repos/agent-kit',
      randomSuffix: () => 'r2d',
      existingEntries: [],
      branchExists: (branch) => branch === 'agent/fix-login-flow',
    })

    expect(target).toStrictEqual({
      branch: 'agent/fix-login-flow-r2d',
      path: '/repos/agent-kit-agent-fix-login-flow-r2d',
      generated: true,
    })
  })

  it('rejects ambiguous explicit branch plus --name input', () => {
    expect(() =>
      resolveNewWorktreeTarget({
        branch: 'feat/auth',
        name: 'auth',
        repoRoot: '/repos/agent-kit',
      }),
    ).toThrow('Use either <branch> or --name, not both.')
  })

  it('fails loudly when generated branch/path candidates keep colliding', () => {
    expect(() =>
      resolveNewWorktreeTarget({
        repoRoot: '/repos/agent-kit',
        now: new Date('2026-05-13T14:27:00'),
        randomSuffix: () => 'aaa',
        branchExists: () => true,
      }),
    ).toThrow('Could not generate a collision-free worktree branch/path after 20 attempts.')
  })

  it('keeps explicit branch behavior stable', () => {
    const target = resolveNewWorktreeTarget({
      branch: 'feat/auth',
      repoRoot: '/repos/agent-kit',
      explicitPath: '/tmp/auth-worktree',
      now: new Date('2026-05-13T14:27:00'),
      randomSuffix: () => 'unused',
      existingEntries: [],
      branchExists: () => false,
    })

    expect(target).toStrictEqual({
      branch: 'feat/auth',
      path: '/tmp/auth-worktree',
      generated: false,
    })
  })

  it('sanitizes generated branch path segments', () => {
    expect(sanitizeWorktreeSegment(' Fix/Login Flow! ')).toBe('fix-login-flow')
    expect(sanitizeWorktreeSegment('!!!')).toBe('agent')
  })
})
