import { describe, expect, it } from 'vitest'

import { generateWorktreePath } from './path.js'

describe('generateWorktreePath', () => {
  it('returns distinct paths for two calls with the same taskId', () => {
    const path1 = generateWorktreePath('/some/base', 'task-abc')
    const path2 = generateWorktreePath('/some/base', 'task-abc')
    expect(path1).not.toStrictEqual(path2)
  })

  it('includes the taskId in the returned path', () => {
    const taskId = 'my-task-123'
    const result = generateWorktreePath('/repo', taskId)
    expect(result).toContain(taskId)
  })

  it('places the worktree under a .wp-worktrees subdirectory of baseDir', () => {
    const result = generateWorktreePath('/repo', 'task-x')
    expect(result.startsWith('/repo/.wp-worktrees/')).toBe(true)
  })
})
