import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('secret orchestration smoke', () => {
  it('documents the release checklist and shared reusable workflows', () => {
    const readme = readFileSync(
      '/Users/ozby/repos/webpresso/github-actions/_worktrees/wp-secret-orchestration-20260619/README.md',
      'utf8',
    )
    const checklist = readFileSync(
      '/Users/ozby/repos/webpresso/agent-kit/_worktrees/wp-secret-orchestration-20260619/docs/release/secret-orchestration-checklist.md',
      'utf8',
    )

    expect(readme).toContain('wp-e2e.yml')
    expect(readme).toContain('wp-cleanup-preview.yml')
    expect(checklist).toContain('G001-execute-the-agent-kit-wp-secret-orch')
  })
})
