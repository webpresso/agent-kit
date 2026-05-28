import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCell, type VariantSpawn } from './variant-runner'

describe('variant-runner', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bench-runner-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
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
})
