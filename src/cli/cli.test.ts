import { afterEach, describe, expect, it, vi } from 'vitest'

import { main, SUPPORTED_COMMANDS } from './cli.js'

const originalArgv = [...process.argv]

afterEach(() => {
  process.argv = [...originalArgv]
  vi.restoreAllMocks()
})

async function runAk(
  args: string[],
): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = []
  const stderr: string[] = []
  vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
    stdout.push(String(message ?? ''))
  })
  // cac 7 switched help/version output from `console.log` to `console.info`
  // — capture both so the subcommand-help assertions still see the text.
  vi.spyOn(console, 'info').mockImplementation((message?: unknown) => {
    stdout.push(String(message ?? ''))
  })
  vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
    stderr.push(String(message ?? ''))
  })
  process.argv = ['node', 'wp', ...args]
  const code = await main()
  return { code, stdout, stderr }
}

describe('wp root command surface', () => {
  it('publishes setup as the primary scaffold command and keeps init as an alias', () => {
    expect(SUPPORTED_COMMANDS).toContain('setup')
    expect(SUPPORTED_COMMANDS).toContain('init')
    expect(SUPPORTED_COMMANDS).toContain('roadmap')
    expect(SUPPORTED_COMMANDS).toContain('install')
    expect(SUPPORTED_COMMANDS).toContain('run')
  })

  it('advertises setup without the unavailable skills refresh action', async () => {
    const result = await runAk(['--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('setup                 Scaffold a consumer repo')
    expect(result.stdout.join('\n')).toContain(
      'install               Install dependencies through the managed vp facade',
    )
    expect(result.stdout.join('\n')).toContain(
      'roadmap               List or show parent roadmaps directly',
    )
    expect(result.stdout.join('\n')).toContain('doctor                Run repo audit health checks')
    expect(result.stdout.join('\n')).toContain(
      'init                  Compatibility alias for setup',
    )
    expect(result.stdout.join('\n')).toContain('skill                 Manage consumer skills')
    expect(result.stdout.join('\n')).toContain('rule                  Manage consumer rules')
    expect(result.stdout.join('\n')).not.toContain('refresh')
  })

  it('routes wp setup to the scaffold command help', async () => {
    const result = await runAk(['setup', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp setup')
    expect(result.stdout.join('\n')).toContain('--with <skills>')
    expect(result.stdout.join('\n')).toContain('--project')
  })

  it('routes wp roadmap to roadmap help', async () => {
    const result = await runAk(['roadmap', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp roadmap')
    expect(result.stdout.join('\n')).toContain('list [status]')
    expect(result.stdout.join('\n')).toContain('show <slug>')
  })

  it('routes wp bench to bench help', async () => {
    const result = await runAk(['bench', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp bench')
    expect(result.stdout.join('\n')).toContain('session-memory')
    expect(result.stdout.join('\n')).toContain('wp bench session-memory --help')
  })

  it('routes wp bench session-memory to command-specific help', async () => {
    const result = await runAk(['bench', 'session-memory', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp bench session-memory')
    expect(result.stdout.join('\n')).toContain('--output-root <path>')
    expect(result.stdout.join('\n')).toContain('--dry-run')
  })

  it("redirects 'wp skills' to 'wp skill' with a helpful rename error", async () => {
    const result = await runAk(['skills', 'refresh'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n')).toContain("'wp skills' was renamed to 'wp skill' in 0.4.0")
    expect(result.stderr.join('\n')).toContain('wp skill <subcommand>')
  })

  it('rejects legacy `wp symlink` with unknown command error', async () => {
    const result = await runAk(['symlink', 'sync'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n').toLowerCase()).toContain('unknown command')
  })

  it('rejects legacy `wp cursor-windsurf-sync` with unknown command error', async () => {
    const result = await runAk(['cursor-windsurf-sync'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n').toLowerCase()).toContain('unknown command')
  })

  it('exposes `wp sync` in help', async () => {
    const result = await runAk(['--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('sync                  Sync agent rules')
  })
})
