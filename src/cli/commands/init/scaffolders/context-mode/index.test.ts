import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SpinnerFactory } from '../spinner.js'
import {
  ensureContextMode,
  patchCodexContextModeHooks,
  patchOpenCodeContextModeConfig,
  upsertContextModeMcpServer,
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

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'ak-context-mode-'))
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('upserts the Codex MCP server block', () => {
    expect(upsertContextModeMcpServer('model = "gpt-5.5"\n')).toContain(
      '[mcp_servers.context-mode]',
    )
    expect(upsertContextModeMcpServer('model = "gpt-5.5"\n')).toContain('command = "context-mode"')
  })

  it('patches Codex hooks with the context-mode hook chain', () => {
    const next = patchCodexContextModeHooks({})
    const hooks = next.hooks as Record<
      string,
      Array<{ matcher?: string; hooks: Array<{ command: string }> }>
    >
    expect(hooks.PreToolUse[0]?.matcher).toContain('context-mode')
    expect(hooks.PostToolUse[0]?.hooks[0]?.command).toBe('context-mode hook codex posttooluse')
    expect(hooks.SessionStart[0]?.hooks[0]?.command).toBe('context-mode hook codex sessionstart')
    expect(hooks.UserPromptSubmit[0]?.hooks[0]?.command).toBe(
      'context-mode hook codex userpromptsubmit',
    )
    expect(hooks.Stop[0]?.hooks[0]?.command).toBe('context-mode hook codex stop')
    // New: compaction event coverage
    expect(hooks.PreCompact[0]?.hooks[0]?.command).toBe('context-mode hook codex precompact')
    expect(hooks.PostCompact[0]?.hooks[0]?.command).toBe('context-mode hook codex postcompact')
  })

  it('generates PreCompact and PostCompact hooks for compaction-event support', () => {
    const next = patchCodexContextModeHooks({})
    const hooks = next.hooks as Record<
      string,
      Array<{ matcher?: string; hooks: Array<{ command: string }> }>
    >
    expect(hooks.PreCompact).toHaveLength(1)
    expect(hooks.PreCompact[0]?.hooks[0]).toStrictEqual({
      type: 'command',
      command: 'context-mode hook codex precompact',
    })
    expect(hooks.PostCompact).toHaveLength(1)
    expect(hooks.PostCompact[0]?.hooks[0]).toStrictEqual({
      type: 'command',
      command: 'context-mode hook codex postcompact',
    })
  })

  it('does not duplicate PreCompact/PostCompact hooks on idempotent re-run', () => {
    const first = patchCodexContextModeHooks({})
    const second = patchCodexContextModeHooks(first)
    const hooks = second.hooks as Record<
      string,
      Array<{ matcher?: string; hooks: Array<{ command: string }> }>
    >
    expect(hooks.PreCompact).toHaveLength(1)
    expect(hooks.PostCompact).toHaveLength(1)
  })

  it('patches OpenCode config with mcp + plugin entries', () => {
    const next = patchOpenCodeContextModeConfig({}, ['bun', '/tmp/agent-kit/src/mcp/cli.ts'])
    expect(next.$schema).toBe('https://opencode.ai/config.json')
    expect(next.mcp).toEqual({
      'context-mode': {
        type: 'local',
        command: ['context-mode'],
      },
      'agent-kit': {
        type: 'local',
        command: ['bun', '/tmp/agent-kit/src/mcp/cli.ts'],
      },
    })
    expect(next.plugin).toEqual(['context-mode'])
  })

  it('writes all three surfaces when context-mode is available', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const codexHooksPath = join(repoRoot, '.codex', 'hooks.json')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')

    const result = ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      codexHooksPath,
      opencodeConfigPath,
      spawn: (() => ({ status: 0, error: undefined })) as never,
    })

    expect(result.codexMcp.action).toBe('created')
    expect(result.codexHooks.action).toBe('created')
    expect(result.opencodeConfig.action).toBe('created')
    expect(result.installed).toBe(false)
    expect(readFileSync(codexConfigPath, 'utf8')).toContain('[mcp_servers.context-mode]')
    expect(readFileSync(codexHooksPath, 'utf8')).toContain('context-mode hook codex pretooluse')
    expect(readFileSync(opencodeConfigPath, 'utf8')).toContain('context-mode')
  })

  it('installs context-mode when missing, then writes all three surfaces', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const codexHooksPath = join(repoRoot, '.codex', 'hooks.json')
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
      codexHooksPath,
      opencodeConfigPath,
      spawn,
    })

    expect(result.installed).toBe(true)
    expect(readFileSync(codexConfigPath, 'utf8')).toContain('[mcp_servers.context-mode]')
  })

  it('calls spinner.start() then spinner.succeed() when context-mode is available', () => {
    const codexConfigPath = join(repoRoot, '.codex', 'config.toml')
    const codexHooksPath = join(repoRoot, '.codex', 'hooks.json')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')
    const { factory, start, succeed, fail } = makeSpinnerFactory()

    ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      codexHooksPath,
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
    const codexHooksPath = join(repoRoot, '.codex', 'hooks.json')
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
        codexHooksPath,
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
    const codexHooksPath = join(repoRoot, '.codex', 'hooks.json')
    const opencodeConfigPath = join(repoRoot, 'opencode.json')

    const result = ensureContextMode({
      repoRoot,
      options: {},
      codexConfigPath,
      codexHooksPath,
      opencodeConfigPath,
      spawn: (() => ({ status: 0, error: undefined })) as never,
    })

    expect(result.installed).toBe(false)
  })

  it('opencode.json plugin array never includes local .opencode/plugins paths — agent-kit-dev-link.js is auto-loaded, not explicitly registered', () => {
    const next = patchOpenCodeContextModeConfig({}, ['vp', 'exec', 'ak', 'mcp'])
    const plugins = next.plugin as string[]

    for (const entry of plugins) {
      expect(entry).not.toContain('.opencode/plugins')
      expect(entry).not.toContain('agent-kit-dev-link')
      expect(entry).not.toMatch(/\.(js|ts)$/)
    }
  })

  it('patchOpenCodeContextModeConfig uses ak mcp directly when globalInstall command is passed', () => {
    const next = patchOpenCodeContextModeConfig({}, ['ak', 'mcp'])
    const mcp = next.mcp as Record<string, { command: unknown }>
    expect(mcp['agent-kit'].command).toEqual(['ak', 'mcp'])
  })

  it('patchOpenCodeContextModeConfig uses vp exec ak mcp as default fallback command', () => {
    const next = patchOpenCodeContextModeConfig({}, ['vp', 'exec', 'ak', 'mcp'])
    const mcp = next.mcp as Record<string, { command: unknown }>
    expect(mcp['agent-kit'].command).toEqual(['vp', 'exec', 'ak', 'mcp'])
  })
})
