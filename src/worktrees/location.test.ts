import { describe, expect, it } from 'vitest'

import { resolveGeneratedWorktreePath, resolveWorktreeRoot } from './location.js'

describe('worktree location policy', () => {
  it('places generated worktrees in a sibling root named after the checkout', () => {
    expect(resolveWorktreeRoot('/repos/webpresso')).toBe('/repos/webpresso_worktrees')
  })

  it('appends generated worktree slugs below the shared root', () => {
    expect(resolveGeneratedWorktreePath('/repos/webpresso_worktrees', 'agent-fix-login')).toBe(
      '/repos/webpresso_worktrees/agent-fix-login',
    )
  })
})
