import { spawnSync as realSpawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ensureOmx } from './index.js'

function okSpawnResult(stdout: string | Buffer = '') {
  return {
    status: 0,
    error: undefined,
    stdout,
    stderr: '',
    pid: 1,
    output: [],
    signal: null,
  }
}

function git(repoRoot: string, args: readonly string[]): void {
  const result = realSpawnSync('git', [...args], { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  }
}

function makeOmxOnlyMockSpawn(): Parameters<typeof ensureOmx>[0]['spawn'] {
  return ((cmd: string, args: readonly string[], options?: object) => {
    if (cmd === 'git') {
      return realSpawnSync(cmd, [...args], options)
    }
    return okSpawnResult()
  }) as Parameters<typeof ensureOmx>[0]['spawn']
}

/**
 * Create an isolated Codex config in its own tmpdir and return its path, so
 * ensureOmx reads/writes that instead of the developer's real ~/.codex.
 */
function makeIsolatedCodexConfig(): string {
  const codexHome = mkdtempSync(join(tmpdir(), 'wp-omx-codex-home-'))
  const configPath = join(codexHome, 'config.toml')
  writeFileSync(configPath, 'model = "gpt-5"\n', 'utf8')
  return configPath
}

describe('ensureOmx project-scope cleanup integration', () => {
  it('removes tracked project-scoped OMX files when migrating project scope to user scope', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wp-omx-project-cleanup-'))
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    mkdirSync(join(repoRoot, '.omx', 'state'), { recursive: true })
    writeFileSync(join(repoRoot, '.codex', 'config.toml'), 'model = "gpt-5"\n', 'utf8')
    writeFileSync(join(repoRoot, '.omx', 'setup-scope.json'), '{"scope":"project"}\n', 'utf8')
    writeFileSync(join(repoRoot, '.omx', 'state', 'local.json'), '{}\n', 'utf8')
    git(repoRoot, ['init'])
    git(repoRoot, ['add', '-f', '.codex/config.toml', '.omx/setup-scope.json'])

    // Isolate the Codex config to a dedicated tmpdir; without this, ensureOmx
    // defaults to the real ~/.codex/config.toml and mutates the developer's
    // global Codex hooks file, making `codexGlobalHooks.repaired` flip across
    // runs/parallel workers (a non-hermetic flake).
    const configPath = makeIsolatedCodexConfig()

    const result = ensureOmx({
      repoRoot,
      options: { overwrite: false, dryRun: false },
      configPath,
      spawn: makeOmxOnlyMockSpawn(),
    })

    expect(result).toMatchObject({
      kind: 'omx-ok',
      installed: false,
      removedProjectFiles: ['.codex/config.toml', '.omx/setup-scope.json'],
      codexGlobalHooks: {
        repaired: false,
      },
    })
    expect(existsSync(join(repoRoot, '.codex', 'config.toml'))).toBe(false)
    expect(existsSync(join(repoRoot, '.omx', 'setup-scope.json'))).toBe(false)
    expect(existsSync(join(repoRoot, '.omx', 'state', 'local.json'))).toBe(true)
  })

  it('does not remove tracked project-scoped files when project scope is explicitly requested', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wp-omx-project-preserve-'))
    mkdirSync(join(repoRoot, '.omx'), { recursive: true })
    writeFileSync(join(repoRoot, '.omx', 'setup-scope.json'), '{"scope":"project"}\n', 'utf8')
    git(repoRoot, ['init'])
    git(repoRoot, ['add', '-f', '.omx/setup-scope.json'])

    const result = ensureOmx({
      repoRoot,
      options: { overwrite: false, dryRun: false },
      scope: 'project',
      configPath: makeIsolatedCodexConfig(),
      spawn: makeOmxOnlyMockSpawn(),
    })

    expect(result).toMatchObject({
      kind: 'omx-ok',
      installed: false,
      removedProjectFiles: [],
      codexGlobalHooks: {
        repaired: false,
      },
    })
    expect(existsSync(join(repoRoot, '.omx', 'setup-scope.json'))).toBe(true)
  })
})
