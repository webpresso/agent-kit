import { afterEach, describe, expect, it, vi } from 'vitest'

import { main, SUPPORTED_COMMANDS } from './cli.js'

const originalArgv = [...process.argv]

afterEach(() => {
  process.argv = [...originalArgv]
  vi.restoreAllMocks()
})

async function runAk(args: string[]): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
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
  })

  it('advertises setup without the unavailable skills refresh action', async () => {
    const result = await runAk(['--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('setup                 Scaffold a consumer repo')
    expect(result.stdout.join('\n')).toContain('init                  Compatibility alias for setup')
    expect(result.stdout.join('\n')).toContain('skills                Manage agent skills (list, install)')
    expect(result.stdout.join('\n')).not.toContain('refresh')
  })

  it('routes ak setup to the scaffold command help', async () => {
    const result = await runAk(['setup', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('ak setup')
    expect(result.stdout.join('\n')).toContain('--with <skills>')
  })

  it('rejects the removed skills refresh action', async () => {
    const result = await runAk(['skills', 'refresh'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n')).toContain("Unknown skills action: refresh")
    expect(result.stderr.join('\n')).toContain("Use 'list' or 'install'")
  })

  it('rejects symlink sync --dry-run instead of advertising a no-op', async () => {
    const result = await runAk(['symlink', 'sync', '--dry-run'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n')).toContain('Unknown option `--dryRun`')
  })
})
