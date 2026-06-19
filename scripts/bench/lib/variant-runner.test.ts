import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildProviderCommand, runCell, type VariantSpawn } from './variant-runner'

describe('variant-runner', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bench-runner-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('builds an isolated Codex exec command for provider-conformance smoke runs', () => {
    expect(
      buildProviderCommand({
        provider: 'codex',
        prompt: 'answer recall',
        pluginDir: '/unused/plugin',
        cwd: '/repo/worktree',
        variant: 'baseline',
        lastMessagePath: '/tmp/last-message.txt',
        codexProfile: 'bench-codex',
      }),
    ).toEqual([
      'codex',
      'exec',
      '--json',
      '--output-last-message',
      '/tmp/last-message.txt',
      '--sandbox',
      'workspace-write',
      '--cd',
      '/repo/worktree',
      '--profile',
      'bench-codex',
      '--ignore-user-config',
      'answer recall',
    ])
  })

  it('runs Codex cells with isolated CODEX_HOME and inline CODEX_API_KEY only from explicit provider env', async () => {
    let seenCmd: string[] | null = null
    let seenEnv: Record<string, string> | null = null
    const spawn: VariantSpawn = async (cmd, options) => {
      seenCmd = cmd
      seenEnv = options.env
      return {
        exitCode: 0,
        stdout: JSON.stringify({ type: 'agent_message', message: 'queue-runner.ts' }),
        stderr: '',
      }
    }

    const result = await runCell({
      provider: 'codex',
      scenario: 'debug',
      prompt: 'say hi',
      variant: 'codex-smoke',
      trial: 1,
      pluginDir: '/tmp/plugin-unused',
      outputRoot: dir,
      cwd: '/repo/worktree-with-poisoned-config',
      apiKeys: { CODEX_API_KEY: 'codex-secret' },
      codexProfile: 'bench-codex',
      spawn,
    })

    expect(result.ok).toBe(true)
    expect(seenCmd).toContain('codex')
    expect(seenCmd).toContain('--ignore-user-config')
    expect(seenCmd).toContain('/repo/worktree-with-poisoned-config')
    expect(seenEnv?.CODEX_HOME).toBe(join(dir, 'adhoc', 'codex-smoke', 'debug', 'trial-1', 'home'))
    expect(seenEnv?.HOME).toBe(seenEnv?.CODEX_HOME)
    expect(seenEnv?.CODEX_API_KEY).toBe('codex-secret')
    expect(seenEnv?.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('runCell returns usage, tools, and transcript_path for a successful cell', async () => {
    const spawn: VariantSpawn = vi.fn(async () => ({
      exitCode: 0,
      stdout: [
        JSON.stringify({
          type: 'assistant',
          timestamp: 1000,
          message: {
            content: [{ type: 'tool_use', name: 'wp_session_search', input: { query: 'memory' } }],
            usage: {
              input_tokens: 10,
              output_tokens: 1,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          },
        }),
        JSON.stringify({
          type: 'result',
          duration_ms: 25,
          usage: {
            input_tokens: 12,
            output_tokens: 3,
            cache_creation_input_tokens: 4,
            cache_read_input_tokens: 5,
          },
        }),
      ].join('\n'),
      stderr: '',
    }))

    const result = await runCell({
      scenario: 'debug',
      prompt: 'say hi',
      variant: 'v1',
      trial: 1,
      pluginDir: '/tmp/plugin-v1',
      outputRoot: dir,
      spawn,
    })

    expect(result).toMatchObject({
      ok: true,
      usage: {
        input_tokens: 12,
        output_tokens: 3,
        cache_creation_input_tokens: 4,
        cache_read_input_tokens: 5,
        duration_ms: 25,
      },
      local_wall_ms: expect.any(Number),
      tools: ['wp_session_search'],
    })

    expect(result.ok && existsSync(result.transcript_path)).toBe(true)
  })

  it('returns a clean rate_limit failure without leaving a partial transcript', async () => {
    const spawn: VariantSpawn = vi.fn(async () => ({
      exitCode: 1,
      stdout: '',
      stderr: '429 rate limit exceeded',
    }))

    const result = await runCell({
      scenario: 'debug',
      prompt: 'say hi',
      variant: 'v2',
      trial: 2,
      pluginDir: '/tmp/plugin-v2',
      outputRoot: dir,
      spawn,
    })

    expect(result).toStrictEqual({
      ok: false,
      error: 'rate_limit',
      usage: null,
      local_wall_ms: expect.any(Number),
      tools: [],
      transcript_path: null,
      home_dir: join(dir, 'adhoc', 'v2', 'debug', 'trial-2', 'home'),
    })
    expect(existsSync(join(dir, 'adhoc', 'v2', 'debug', 'trial-2', 'transcript.jsonl'))).toBe(false)
  })

  it('passes the per-variant API key through the spawned environment', async () => {
    let seenEnv: Record<string, string> | null = null
    const spawn: VariantSpawn = async (_cmd, options) => {
      seenEnv = options.env
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          type: 'result',
          duration_ms: 1,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }),
        stderr: '',
      }
    }

    await runCell({
      scenario: 'debug',
      prompt: 'say hi',
      variant: 'main',
      trial: 3,
      pluginDir: '/tmp/plugin-main',
      outputRoot: dir,
      apiKeys: {
        ANTHROPIC_API_KEY_MAIN: 'secret-main',
      },
      spawn,
    })

    expect(seenEnv?.ANTHROPIC_API_KEY).toBe('secret-main')
  })

  it('uses the logged-in Claude home for explicit claude-login auth mode', async () => {
    const originalAuthMode = process.env.BENCH_AUTH_MODE
    const originalBenchClaudeHome = process.env.BENCH_CLAUDE_HOME
    process.env.BENCH_AUTH_MODE = 'claude-login'
    process.env.BENCH_CLAUDE_HOME = '/tmp/logged-in-claude-home'

    let seenEnv: Record<string, string> | null = null
    const spawn: VariantSpawn = async (_cmd, options) => {
      seenEnv = options.env
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          type: 'result',
          duration_ms: 1,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        }),
        stderr: '',
      }
    }

    try {
      await runCell({
        scenario: 'debug',
        prompt: 'say hi',
        variant: 'baseline',
        trial: 4,
        pluginDir: '/tmp/plugin-main',
        outputRoot: dir,
        authMode: 'claude-login',
        claudeHome: '/tmp/logged-in-claude-home',
        spawn,
      })
    } finally {
      if (originalAuthMode === undefined) delete process.env.BENCH_AUTH_MODE
      else process.env.BENCH_AUTH_MODE = originalAuthMode
      if (originalBenchClaudeHome === undefined) delete process.env.BENCH_CLAUDE_HOME
      else process.env.BENCH_CLAUDE_HOME = originalBenchClaudeHome
    }

    expect(seenEnv?.HOME).toBe('/tmp/logged-in-claude-home')
    expect(seenEnv?.ANTHROPIC_API_KEY).toBeUndefined()
  })
})
