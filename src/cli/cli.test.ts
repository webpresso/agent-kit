import { afterEach, describe, expect, it, vi } from 'vitest'

import { main, SUPPORTED_COMMANDS } from './cli.js'

const originalArgv = [...process.argv]

afterEach(() => {
  process.argv = [...originalArgv]
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
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
    expect(SUPPORTED_COMMANDS).toContain('qa')
    expect(SUPPORTED_COMMANDS).toContain('install')
    expect(SUPPORTED_COMMANDS).toContain('run')
    expect(SUPPORTED_COMMANDS).toContain('logs')
  })

  it('advertises setup without the unavailable skills refresh action', async () => {
    const result = await runAk(['--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('setup                 Scaffold a consumer repo')
    expect(result.stdout.join('\n')).toContain(
      'install               Install dependencies through the managed package/task facade',
    )
    expect(result.stdout.join('\n')).toContain(
      'Refresh wp and any wp-managed optional OMX/OMC integrations by default; use --deps for local dependencies',
    )
    expect(result.stdout.join('\n')).not.toContain('Update local dependencies by default')
    expect(result.stdout.join('\n')).toContain(
      'roadmap               List or show parent roadmaps directly',
    )
    expect(result.stdout.join('\n')).toContain(
      'qa                    Run the repository QA gate through the portable wp surface',
    )
    expect(result.stdout.join('\n')).toContain(
      'logs                  Print persisted raw output from recent quality runs',
    )
    expect(result.stdout.join('\n')).toContain('doctor                Run repo audit health checks')
    expect(result.stdout.join('\n')).toContain(
      'init                  Compatibility alias for setup',
    )
    expect(result.stdout.join('\n')).toContain('skill                 Manage consumer skills')
    expect(result.stdout.join('\n')).toContain('rule                  Manage consumer rules')
    expect(result.stdout.join('\n')).not.toContain('refresh                ')
  })

  it('routes wp setup to the scaffold command help', async () => {
    const result = await runAk(['setup', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp setup')
    expect(result.stdout.join('\n')).toContain('--with <skills>')
    expect(result.stdout.join('\n')).toContain('--project')
  })

  it('routes wp update to command-specific help with deps and global mode options', async () => {
    const result = await runAk(['update', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp update')
    expect(result.stdout.join('\n')).toContain('--deps')
    expect(result.stdout.join('\n')).toContain('--global')
    expect(result.stdout.join('\n')).toContain(
      'Update local dependencies through managed package/task update',
    )
    expect(result.stdout.join('\n')).toContain(
      'Compatibility alias for the default tooling refresh',
    )
    expect(result.stdout.join('\n')).not.toContain(
      'Update local dependencies through the managed package/task facade (default)',
    )
  })

  it('routes wp lint to command-specific help with standardized file targeting', async () => {
    const result = await runAk(['lint', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp lint')
    expect(result.stdout.join('\n')).toContain('Usage:')
    expect(result.stdout.join('\n')).not.toContain('[...files]')
    expect(result.stdout.join('\n')).toContain('--file <path>')
  })

  it('routes wp format to command-specific help with standardized file targeting', async () => {
    const result = await runAk(['format', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp format')
    expect(result.stdout.join('\n')).not.toContain('[...files]')
    expect(result.stdout.join('\n')).toContain('--file <path>')
  })

  it('routes wp test to command-specific help without positional targets', async () => {
    const result = await runAk(['test', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp test')
    expect(result.stdout.join('\n')).not.toContain('[...targets]')
    expect(result.stdout.join('\n')).toContain('--file <path>')
    expect(result.stdout.join('\n')).toContain('--package <name>')
  })

  it('routes wp e2e to command-specific help without positional files', async () => {
    const result = await runAk(['e2e', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp e2e')
    expect(result.stdout.join('\n')).not.toContain('[...files]')
    expect(result.stdout.join('\n')).toContain('--file <path>')
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

  it('executes wp bench session-memory through the bench action instead of silently no-oping', async () => {
    const previous = process.env.WP_COMPILED_RUNTIME
    process.env.WP_COMPILED_RUNTIME = '1'
    try {
      const result = await runAk(['bench', 'session-memory', '--dry-run'])

      expect(result.code).toBe(1)
      expect(result.stderr.join('\n')).toContain('not available from the compiled runtime')
    } finally {
      if (previous === undefined) {
        delete process.env.WP_COMPILED_RUNTIME
      } else {
        process.env.WP_COMPILED_RUNTIME = previous
      }
    }
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

  it('exposes `wp sync` in help', async () => {
    const result = await runAk(['--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('sync                  Sync agent rules')
  })

  it('rejects package-manager wrapper invocation for normal commands', async () => {
    vi.stubEnv('npm_lifecycle_event', 'wp')
    vi.stubEnv('npm_execpath', '/opt/homebrew/Cellar/bun/1.3.13/bin/bun')

    const result = await runAk(['test'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n')).toContain('wrapper invocation is forbidden')
    expect(result.stderr.join('\n')).toContain('Use wp_test MCP tool when available')
    expect(result.stderr.join('\n')).toContain('run direct `wp test`')
  })

  it.each([
    ['/opt/homebrew/Cellar/bun/1.3.13/bin/bun', 'bun'],
    ['/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs', 'pnpm'],
    ['/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js', 'npm'],
    ['/opt/homebrew/lib/node_modules/yarn/bin/yarn.js', 'yarn'],
  ])('rejects lifecycle-wrapped wp setup for %s', async (execPath, manager) => {
    vi.stubEnv('npm_lifecycle_event', 'wp')
    vi.stubEnv('npm_execpath', execPath)

    const result = await runAk(['setup'])

    expect(result.code).toBe(1)
    expect(result.stderr.join('\n')).toContain(`forbidden (${manager})`)
    expect(result.stderr.join('\n')).toContain('run direct `wp setup`')
  })

  it('keeps help available even inside a package-script lifecycle env', async () => {
    vi.stubEnv('npm_lifecycle_event', 'wp')
    vi.stubEnv('npm_execpath', '/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs')

    const result = await runAk(['setup', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout.join('\n')).toContain('wp setup')
    expect(result.stderr.join('\n')).not.toContain('wrapper invocation is forbidden')
  })
})
