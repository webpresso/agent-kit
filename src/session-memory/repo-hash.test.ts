import { afterEach, describe, expect, it } from 'vitest'

import { computeRepoHash, resolveSessionRepoHash } from './repo-hash.js'

const originalWpRepoHash = process.env['WP_REPO_HASH']
const originalClaudeRepoHash = process.env['CLAUDE_REPO_HASH']

afterEach(() => {
  if (originalWpRepoHash === undefined) delete process.env['WP_REPO_HASH']
  else process.env['WP_REPO_HASH'] = originalWpRepoHash
  if (originalClaudeRepoHash === undefined) delete process.env['CLAUDE_REPO_HASH']
  else process.env['CLAUDE_REPO_HASH'] = originalClaudeRepoHash
})

describe('resolveSessionRepoHash', () => {
  it('prefers the explicit WP_REPO_HASH override', () => {
    process.env['WP_REPO_HASH'] = 'wp-override'
    process.env['CLAUDE_REPO_HASH'] = 'claude-override'

    expect(resolveSessionRepoHash(process.cwd())).toBe('wp-override')
  })

  it('falls back to CLAUDE_REPO_HASH when WP_REPO_HASH is absent', () => {
    delete process.env['WP_REPO_HASH']
    process.env['CLAUDE_REPO_HASH'] = 'claude-override'

    expect(resolveSessionRepoHash(process.cwd())).toBe('claude-override')
  })

  it('falls back to the computed repo hash when no override is set', () => {
    delete process.env['WP_REPO_HASH']
    delete process.env['CLAUDE_REPO_HASH']

    expect(resolveSessionRepoHash(process.cwd())).toBe(computeRepoHash(process.cwd()))
  })
})
