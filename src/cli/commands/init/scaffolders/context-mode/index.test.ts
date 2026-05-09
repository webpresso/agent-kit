import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ensureContextMode,
  patchCodexContextModeHooks,
  patchOpenCodeContextModeConfig,
  upsertContextModeMcpServer,
} from './index.js'

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
  })

  it('patches OpenCode config with mcp + plugin entries', () => {
    const next = patchOpenCodeContextModeConfig({})
    expect(next.$schema).toBe('https://opencode.ai/config.json')
    expect(next.mcp).toEqual({
      'context-mode': {
        type: 'local',
        command: ['context-mode'],
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
      if (cmd === 'npm') return { status: 0, error: undefined }
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
})
