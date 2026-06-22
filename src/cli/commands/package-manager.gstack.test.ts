import { describe, expect, it, vi } from 'vitest'

import { runPackageManagerCommand } from './package-manager.js'
import { claimUserOwnedTool, defaultToolingOwnershipState } from '#cli/tooling-ownership'

describe('wp update Webpresso-owned gstack refresh', () => {
  it('does not clone, pull, or run upstream setup for gstack ownership', () => {
    const run = vi.fn(() => ({
      status: 0,
      signal: null,
      stderr: '',
      stdout: '',
      output: [],
      pid: 1,
    }))
    const ownershipState = claimUserOwnedTool(defaultToolingOwnershipState(), 'gstack')

    const status = runPackageManagerCommand('update', {
      argv: ['node', 'wp', 'update'],
      cwd: '/repo',
      ownershipState,
      repoKey: null,
      packageRoot: '/pkg',
      resolveVpCommand: () => ({ command: 'vp', argsPrefix: [], executable: 'vp' }),
      refreshClaudePlugin: () => ({
        status: 0,
        signal: null,
        stderr: '',
        stdout: '',
        output: [],
        pid: 1,
      }),
      refreshCodexPlugin: () => ({
        status: 0,
        signal: null,
        stderr: '',
        stdout: '',
        output: [],
        pid: 1,
      }),
      run,
    })

    expect(status).toBe(0)
    expect(run.mock.calls.flat().join(' ')).not.toContain('github.com/garrytan/gstack')
    expect(run.mock.calls.flat().join(' ')).not.toContain('./setup')
  })
})
