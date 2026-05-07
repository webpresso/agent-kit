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
  vi.spyOn(console, 'error').mockImplementation((message?: unknown) => {
    stderr.push(String(message ?? ''))
  })
  process.argv = ['node', 'ak', ...args]
  const code = await main()
  return { code, stdout, stderr }
}

describe('ak root command surface', () => {
  it('publishes setup as the primary scaffold command and keeps init as an alias', () => {
    expect(SUPPORTED_COMMANDS).toContain('setup')
    expect(SUPPORTED_COMMANDS).toContain('init')
    expect(SUPPORTED_COMMANDS).toContain('roadmap')
  })

  it('advertises setup without the unavailable skills refresh action', async () => {
    const result = await runAk(['--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('setup                 Scaffold a consumer repo')
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

  it('routes ak setup to the scaffold command help', async () => {
    const result = await runAk(['setup', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('ak setup')
    expect(result.stdout.join('\n')).toContain('--with <skills>')
  })

  it('routes ak roadmap to roadmap help', async () => {
    const result = await runAk(['roadmap', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('ak roadmap')
    expect(result.stdout.join('\n')).toContain('list [status]')
    expect(result.stdout.join('\n')).toContain('show <slug>')
  })

  it("redirects 'ak skills' to 'ak skill' with a helpful rename error", async () => {
    const result = await runAk(['skills', 'refresh'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n')).toContain("'ak skills' was renamed to 'ak skill' in 0.4.0")
    expect(result.stderr.join('\n')).toContain('ak skill <subcommand>')
  })

  it('rejects legacy `ak symlink` with unknown command error', async () => {
    const result = await runAk(['symlink', 'sync'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n').toLowerCase()).toContain('unknown command')
  })

  it('rejects legacy `ak cursor-windsurf-sync` with unknown command error', async () => {
    const result = await runAk(['cursor-windsurf-sync'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n').toLowerCase()).toContain('unknown command')
  })

  it('exposes `ak sync` in help', async () => {
    const result = await runAk(['--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('sync                  Sync agent rules')
  })
})
