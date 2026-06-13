import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { CODEX_PLUGIN_ID, ensureCodexUserPlugin } from './index.js'

const tempRoots: string[] = []

function makePackageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'wp-codex-plugin-'))
  tempRoots.push(root)
  mkdirSync(join(root, '.codex-plugin'), { recursive: true })
  writeFileSync(join(root, '.codex-plugin', 'plugin.json'), '{"name":"agent-kit"}\n', 'utf8')
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
  delete process.env.WP_SKIP_CODEX_PLUGIN
})

describe('ensureCodexUserPlugin', () => {
  it('runs marketplace add then plugin add (the verified non-interactive verbs)', () => {
    const packageRoot = makePackageRoot()
    const calls: Array<{ command: string; args: readonly string[] }> = []

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      commandExists: () => true,
      runCommand: (command, args) => {
        calls.push({ command, args })
        return 0
      },
    })

    expect(result).toEqual({
      kind: 'codex-plugin-installed',
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
    })
    expect(calls).toEqual([
      { command: 'codex', args: ['plugin', 'marketplace', 'add', packageRoot] },
      { command: 'codex', args: ['plugin', 'add', CODEX_PLUGIN_ID] },
    ])
  })

  it('skips when the .codex-plugin manifest is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-codex-plugin-bare-'))
    tempRoots.push(root)

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot: root,
      commandExists: () => true,
      runCommand: () => {
        throw new Error('should not run')
      },
    })

    expect(result).toEqual({ kind: 'codex-plugin-unavailable', packageRoot: root })
  })

  it('skips cleanly in dry-run mode', () => {
    const packageRoot = makePackageRoot()

    const result = ensureCodexUserPlugin({
      options: { dryRun: true, overwrite: false },
      packageRoot,
      commandExists: () => true,
      runCommand: () => {
        throw new Error('should not run')
      },
    })

    expect(result).toEqual({ kind: 'codex-plugin-skipped-dry-run', packageRoot })
  })

  it('skips when codex is not on PATH', () => {
    const packageRoot = makePackageRoot()

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      commandExists: () => false,
      runCommand: () => {
        throw new Error('should not run')
      },
    })

    expect(result).toEqual({ kind: 'codex-plugin-skipped-no-cli', packageRoot })
  })

  it('returns a failing step when a codex subcommand fails', () => {
    const packageRoot = makePackageRoot()

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      commandExists: () => true,
      runCommand: (_command, args) => (args[1] === 'add' ? 17 : 0),
    })

    expect(result).toEqual({
      kind: 'codex-plugin-failed',
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      step: 'plugin-add',
      exitCode: 17,
    })
  })

  it('supports an env opt-out', () => {
    const packageRoot = makePackageRoot()
    process.env.WP_SKIP_CODEX_PLUGIN = '1'

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      commandExists: () => true,
      runCommand: () => {
        throw new Error('should not run')
      },
    })

    expect(result).toEqual({ kind: 'codex-plugin-skipped-opt-out', packageRoot })
  })
})
