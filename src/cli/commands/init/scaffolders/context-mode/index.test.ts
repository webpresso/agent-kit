import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SpinnerFactory } from '../spinner.js'
import {
  ensureContextMode,
  patchOpenCodeContextModeConfig,
  upsertCodexContextModeFeatures,
} from './index.js'

function makeSpinnerFactory(): {
  factory: SpinnerFactory
  start: ReturnType<typeof vi.fn>
  succeed: ReturnType<typeof vi.fn>
  fail: ReturnType<typeof vi.fn>
} {
  const start = vi.fn()
  const succeed = vi.fn()
  const fail = vi.fn()
  const factory: SpinnerFactory = (_text: string) => ({ start, succeed, fail })
  return { factory, start, succeed, fail }
}

describe('context-mode preset', () => {
  let repoRoot: string
  let originalPath: string | undefined

  beforeEach(() => {
    originalPath = process.env.PATH
    repoRoot = mkdtempSync(join(tmpdir(), 'wp-context-mode-'))
    const fakeBinDir = join(repoRoot, 'bin')
    const fakeContextMode = join(fakeBinDir, 'context-mode')
    mkdirSync(fakeBinDir, { recursive: true })
    writeFileSync(fakeContextMode, '#!/usr/bin/env sh\necho 1.2.3\n', 'utf8')
    chmodSync(fakeContextMode, 0o755)
    process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`
  })

  afterEach(() => {
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('upserts Codex feature gates for plugin-provided context-mode hooks', () => {
    const next = upsertCodexContextModeFeatures('model = "gpt-5.5"\n')
    expect(next).toContain('[features]')
    expect(next).toContain('hooks = true')
    expect(next).toContain('plugin_hooks = true')
    expect(next).not.toContain('[mcp_servers.context-mode]')
  })

  it('patches an existing Codex features table without writing the legacy alias', () => {
    const next = upsertCodexContextModeFeatures(
      'model = "gpt-5.5"\n\n[features]\ncodex_hooks = false\nhooks = false\n\n[projects."/repo"]\ntrust_level = "trusted"\n',
    )
    expect(next).toContain('[features]\ncodex_hooks = false\nhooks = true\nplugin_hooks = true')
    expect(next).toContain('[projects."/repo"]')
    expect(next).not.toContain('codex_hooks = true')
  })

  it('patches OpenCode config with mcp + plugin entries', () => {
    const next = patchOpenCodeContextModeConfig({}, ['bun', '/tmp/webpresso/src/mcp/cli.ts'])
    expect(next.$schema).toBe('https://opencode.ai/config.json')
    expect(next.mcp).toEqual({
      'context-mode': {
        type: 'local',
        command: ['context-mode'],
      },
      webpresso: {
        type: 'local',
        command: ['bun', '/tmp/webpresso/src/mcp/cli.ts'],
      },
    })
    expect(next.plugin).toEqual(['context-mode'])
  })

  it('writes Codex feature gates plus OpenCode config when context-mode is available', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const codexHooksPath = join(repoRoot, '.codex', 'hooks.json')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')

    const result = ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      opencodeConfigPath,
      spawn: (() => ({ status: 0, error: undefined })) as never,
    })

    expect(result.codexFeatures.action).toBe('created')
    expect(result.opencodeConfig.action).toBe('created')
    expect(result.installed).toBe(false)
    expect(readFileSync(codexConfigPath, 'utf8')).toContain('[features]')
    expect(readFileSync(codexConfigPath, 'utf8')).toContain('hooks = true')
    expect(readFileSync(codexConfigPath, 'utf8')).toContain('plugin_hooks = true')
    expect(result.codexMcpServer.action).toBe('overwritten')
    expect(result.codexGlobalHooks.action).toBe('created')
    expect(readFileSync(codexHooksPath, 'utf8')).toContain('context-mode')
    expect(readFileSync(codexConfigPath, 'utf8')).toContain('[mcp_servers.context-mode]')
    expect(readFileSync(opencodeConfigPath, 'utf8')).toContain('context-mode')
  })

  it('updates context-mode through vp when already available', () => {
    const spawn = vi.fn((cmd: string) => {
      if (cmd === 'context-mode') {
        return { status: 0, error: undefined, stdout: cmd === 'context-mode' ? '1.2.3' : '' }
      }
      return { status: 0, error: undefined, stdout: '' }
    }) as never

    ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath: join(repoRoot, '.codex', 'config.toml'),
      opencodeConfigPath: join(repoRoot, 'opencode.json'),
      spawn,
    })

    expect(spawn).toHaveBeenCalledWith('vp', ['update', '-g', 'context-mode'], {
      stdio: 'inherit',
    })
  })

  it('installs context-mode when missing, then writes Codex feature gates', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')

    let calls = 0
    const spawn = ((cmd: string) => {
      calls += 1
      if (calls === 1)
        return { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) }
      if (cmd === 'vp') return { status: 0, error: undefined }
      return { status: 0, error: undefined }
    }) as never

    const result = ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      opencodeConfigPath,
      spawn,
    })

    expect(result.installed).toBe(true)
    expect(readFileSync(codexConfigPath, 'utf8')).toContain('plugin_hooks = true')
  })

  it('calls spinner.start() then spinner.succeed() when context-mode is available', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')
    const { factory, start, succeed, fail } = makeSpinnerFactory()

    ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      opencodeConfigPath,
      spawn: (() => ({ status: 0, error: undefined })) as never,
      spinnerFactory: factory,
    })

    expect(start).toHaveBeenCalledTimes(1)
    expect(succeed).toHaveBeenCalledTimes(1)
    expect(fail).not.toHaveBeenCalled()
  })

  it('calls spinner.fail() when context-mode install fails', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')
    const { factory, start, fail, succeed } = makeSpinnerFactory()

    let calls = 0
    const spawn = (() => {
      calls += 1
      // First call (probe): fail; second call (vp install): fail
      return {
        status: calls === 1 ? null : 1,
        error: calls === 1 ? new Error('ENOENT') : undefined,
      }
    }) as never

    expect(() =>
      ensureContextMode({
        repoRoot,
        options: {},
        codexConfigPath,
        opencodeConfigPath,
        spawn,
        spinnerFactory: factory,
      }),
    ).toThrow()

    expect(start).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledTimes(1)
    expect(succeed).not.toHaveBeenCalled()
  })

  it('uses noop spinner (no real ora) when spinnerFactory is not provided', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')

    const result = ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      opencodeConfigPath,
      spawn: (() => ({ status: 0, error: undefined })) as never,
    })

    expect(result.installed).toBe(false)
  })

  it('opencode.json plugin array never includes local .opencode/plugins paths — generated webpresso hooks are auto-loaded, not explicitly registered', () => {
    const next = patchOpenCodeContextModeConfig({}, ['wp', 'mcp'])
    const plugins = next.plugin as string[]

    for (const entry of plugins) {
      expect(entry).not.toContain('.opencode/plugins')
      expect(entry).not.toContain('webpresso-hooks')
      expect(entry).not.toMatch(/\.(js|ts)$/)
    }
  })

  it('patchOpenCodeContextModeConfig uses wp mcp directly when passed explicitly', () => {
    const next = patchOpenCodeContextModeConfig({}, ['wp', 'mcp'])
    const mcp = next.mcp as Record<string, { command: unknown }>
    expect(mcp['webpresso'].command).toEqual(['wp', 'mcp'])
  })

  it('patchOpenCodeContextModeConfig defaults to wp mcp for webpresso', () => {
    const next = patchOpenCodeContextModeConfig({})
    const mcp = next.mcp as Record<string, { command: unknown }>
    expect(mcp['webpresso'].command).toEqual(['wp', 'mcp'])
  })

  it('normalizes the Claude context-mode cache-heal hook to an absolute node launch', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')
    const claudeSettingsPath = join(repoRoot, '.home', '.claude', 'settings.json')
    const cacheHealPath = join(repoRoot, '.home', '.claude', 'hooks', 'context-mode-cache-heal.mjs')
    const nodeBinary = join(repoRoot, 'bin', 'node')

    mkdirSync(join(repoRoot, '.home', '.claude', 'hooks'), { recursive: true })
    writeFileSync(cacheHealPath, '#!/usr/bin/env node\nprocess.exit(0)\n', 'utf8')
    writeFileSync(nodeBinary, '#!/usr/bin/env sh\nexit 0\n', 'utf8')
    chmodSync(nodeBinary, 0o755)
    writeFileSync(
      claudeSettingsPath,
      `${JSON.stringify(
        {
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: `"${cacheHealPath}"` }] }],
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    )

    const result = ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      claudeSettingsPath,
      opencodeConfigPath,
      nodeBinary,
      spawn: (() => ({ status: 0, error: undefined })) as never,
    })

    expect(result.claudeGlobalHooks.action).toBe('overwritten')
    expect(readFileSync(claudeSettingsPath, 'utf8')).toContain(`'${nodeBinary}' '${cacheHealPath}'`)
  })

  it('does not create Claude global settings when the file is absent', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')
    const claudeSettingsPath = join(repoRoot, '.home', '.claude', 'settings.json')

    const result = ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      claudeSettingsPath,
      opencodeConfigPath,
      nodeBinary: join(repoRoot, 'bin', 'node'),
      spawn: (() => ({ status: 0, error: undefined })) as never,
    })

    expect(result.claudeGlobalHooks.action).toBe('identical')
    expect(() => readFileSync(claudeSettingsPath, 'utf8')).toThrow()
  })
})
