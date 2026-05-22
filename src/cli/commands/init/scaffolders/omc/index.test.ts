import { describe, expect, it, vi } from 'vitest'

import { ensureOmc, OMC_MARKETPLACE, OMC_PLUGIN_ID } from './index.js'

describe('ensureOmc', () => {
  it('installs OMC through user-scoped Claude Code plugin commands by default', () => {
    const runCommand = vi.fn(() => 0)
    const result = ensureOmc({
      options: { overwrite: false, dryRun: false },
      commandExists: () => true,
      runCommand,
    })

    expect(result).toEqual({ kind: 'omc-installed', pluginId: OMC_PLUGIN_ID, scope: 'user' })
    expect(runCommand).toHaveBeenNthCalledWith(1, 'claude', [
      'plugin',
      'marketplace',
      'add',
      '--scope',
      'user',
      OMC_MARKETPLACE,
    ])
    expect(runCommand).toHaveBeenNthCalledWith(2, 'claude', [
      'plugin',
      'install',
      '--scope',
      'user',
      OMC_PLUGIN_ID,
    ])
    expect(runCommand).toHaveBeenCalledTimes(2)
  })

  it('uses project scope when requested', () => {
    const runCommand = vi.fn(() => 0)
    const result = ensureOmc({
      options: { overwrite: false, dryRun: false },
      scope: 'project',
      commandExists: () => true,
      runCommand,
    })

    expect(result).toEqual({ kind: 'omc-installed', pluginId: OMC_PLUGIN_ID, scope: 'project' })
    expect(runCommand).toHaveBeenNthCalledWith(1, 'claude', [
      'plugin',
      'marketplace',
      'add',
      '--scope',
      'project',
      OMC_MARKETPLACE,
    ])
  })

  it('skips dry-run without probing Claude Code', () => {
    const commandExists = vi.fn(() => true)
    const result = ensureOmc({
      options: { overwrite: false, dryRun: true },
      commandExists,
      runCommand: vi.fn(),
    })

    expect(result).toEqual({ kind: 'omc-skipped-dry-run', scope: 'user' })
    expect(commandExists).not.toHaveBeenCalled()
  })

  it('skips when Claude Code is not on PATH', () => {
    const result = ensureOmc({
      options: { overwrite: false, dryRun: false },
      commandExists: () => false,
      runCommand: vi.fn(),
    })

    expect(result).toEqual({ kind: 'omc-skipped-no-cli', scope: 'user' })
  })

  it('reports the failing plugin step', () => {
    const runCommand = vi.fn((_, args: readonly string[]) => (args[1] === 'install' ? 7 : 0))
    const result = ensureOmc({
      options: { overwrite: false, dryRun: false },
      commandExists: () => true,
      runCommand,
    })

    expect(result).toEqual({
      kind: 'omc-failed',
      pluginId: OMC_PLUGIN_ID,
      scope: 'user',
      step: 'plugin-install',
      exitCode: 7,
    })
    expect(runCommand).toHaveBeenCalledTimes(2)
  })
})
