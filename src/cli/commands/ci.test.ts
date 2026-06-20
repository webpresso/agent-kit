import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_CI_ACT_TIMEOUT_MS,
  MAX_CI_ACT_TIMEOUT_MS,
  buildCiActCommand,
  normalizeCiActTimeoutMs,
  parseCiActTimeoutMs,
  runCiActCommand,
  validateCiActCommand,
} from './ci'

describe('wp ci command', () => {
  const defaultArchitecture =
    process.platform === 'darwin' && process.arch === 'arm64' ? 'linux/arm64' : 'linux/amd64'

  it('exports a dedicated ci act timeout budget above the generic runner default', () => {
    expect(DEFAULT_CI_ACT_TIMEOUT_MS).toBe(20 * 60_000)
    expect(MAX_CI_ACT_TIMEOUT_MS).toBe(60 * 60_000)
  })

  it('builds a public secret-gate act command by default', () => {
    const command = buildCiActCommand({ workflow: 'ci-e2e' }, '/repo')

    expect(command.command).toBe('wp')
    expect(command.args).toEqual([
      'secrets',
      'run',
      '--sink',
      'act',
      '--profile',
      'preview',
      '--',
      'bash',
      '-lc',
      expect.stringContaining('--secret-file'),
      'wp-ci-act',
      'pull_request',
      '-W',
      '/repo/.github/workflows/ci-e2e.yml',
      '-P',
      'ubicloud-standard-2=ghcr.io/catthehacker/ubuntu:full-latest',
      '--rm',
      '--container-architecture',
      defaultArchitecture,
    ])
  })

  it('forwards only documented safe act options', () => {
    const command = buildCiActCommand(
      {
        workflowPath: '.github/workflows/ci.yml',
        execute: true,
        job: 'webpresso',
        eventName: 'workflow_dispatch',
        envProfile: 'secrets-only',
        secretEnvProfile: 'ci-local',
        containerArchitecture: 'linux/arm64',
        platformImage: 'image',
        eventPath: 'event.json',
      },
      '/repo',
    )

    expect(command.args).toEqual([
      'secrets',
      'run',
      '--sink',
      'act',
      '--profile',
      'ci-local',
      '--',
      'bash',
      '-lc',
      expect.stringContaining('--secret-file'),
      'wp-ci-act',
      'workflow_dispatch',
      '-W',
      '/repo/.github/workflows/ci.yml',
      '-P',
      'ubicloud-standard-2=image',
      '--rm',
      '-j',
      'webpresso',
      '-e',
      '/repo/event.json',
      '--container-architecture',
      'linux/arm64',
    ])
  })

  it('keeps the internal secret-file wrapper for no-secret profiles', () => {
    const command = buildCiActCommand(
      {
        workflow: 'ci-e2e',
        envProfile: 'public',
      },
      '/repo',
    )

    expect(command.command).toBe('bash')
    expect(command.args.slice(0, 3)).toEqual([
      '-lc',
      expect.stringContaining('--secret-file'),
      'wp-ci-act',
    ])
    expect(command.args.slice(3)).toEqual([
      'pull_request',
      '-W',
      '/repo/.github/workflows/ci-e2e.yml',
      '-P',
      'ubicloud-standard-2=ghcr.io/catthehacker/ubuntu:full-latest',
      '--rm',
      '--container-architecture',
      defaultArchitecture,
    ])
  })

  it('does not expose legacy unsafe argv in the public helper contract', () => {
    const command = buildCiActCommand({ workflow: 'ci-e2e' }, '/repo')
    expect(command.args.join(' ')).not.toContain('--chef-token')
    expect(command.args.join(' ')).not.toContain('--allow-local-chef-token')
    expect(command.args.join(' ')).not.toContain('--allow-host-mutation')
    expect(command.args.join(' ')).not.toContain('--direct')
    expect(command.args.join(' ')).not.toContain('apps/scripts/src/ci/act.ts')
    expect(command.args.join(' ')).not.toContain('apps/scripts/src/lib/with-secrets.ts')
  })

  it('dry-runs by printing the sanitized command without spawning', async () => {
    const run = vi.fn()
    const stdout = vi.fn(() => true)
    const code = await runCiActCommand(
      { workflow: 'ci-e2e' },
      {
        cwd: '/repo',
        run,
        stdout: { write: stdout },
      },
    )

    expect(code).toBe(0)
    expect(run).not.toHaveBeenCalled()
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"command":"wp"'))
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('secrets'))
    expect(stdout).toHaveBeenCalledWith(expect.not.stringContaining('chef-token'))
  })

  it('executes through the shared secret-gate runner only when execute=true', async () => {
    const run = vi.fn(async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      stdout: 'ok',
      stderr: '',
    }))
    const stdout = vi.fn(() => true)
    const code = await runCiActCommand(
      { workflow: 'ci-e2e', execute: true },
      {
        cwd: '/repo',
        run,
        stdout: { write: stdout },
      },
    )

    expect(code).toBe(0)
    expect(run).toHaveBeenCalledWith({
      cwd: '/repo',
      envProfile: 'none',
      command: 'wp',
      timeoutMs: DEFAULT_CI_ACT_TIMEOUT_MS,
      args: [
        'secrets',
        'run',
        '--sink',
        'act',
        '--profile',
        'preview',
        '--',
        'bash',
        '-lc',
        expect.stringContaining('--secret-file'),
        'wp-ci-act',
        'pull_request',
        '-W',
        '/repo/.github/workflows/ci-e2e.yml',
        '-P',
        'ubicloud-standard-2=ghcr.io/catthehacker/ubuntu:full-latest',
        '--rm',
        '--container-architecture',
        defaultArchitecture,
      ],
    })
  })

  it('honors an explicit ci act timeout override', async () => {
    const run = vi.fn(async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
      aborted: false,
      stdout: '',
      stderr: '',
    }))

    await runCiActCommand(
      { workflow: 'ci-e2e', execute: true, timeoutMs: 45_000 },
      {
        cwd: '/repo',
        run,
      },
    )

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 45_000,
      }),
    )
  })

  it('rejects invalid ci act timeout values at the CLI and programmatic boundary', async () => {
    expect(parseCiActTimeoutMs('45000')).toBe(45_000)
    expect(() => parseCiActTimeoutMs('0')).toThrow('--timeout-ms must be a positive integer')
    expect(() => parseCiActTimeoutMs('not-a-number')).toThrow(
      '--timeout-ms must be a positive integer',
    )
    expect(() => parseCiActTimeoutMs(String(MAX_CI_ACT_TIMEOUT_MS + 1))).toThrow(
      `--timeout-ms must be <= ${MAX_CI_ACT_TIMEOUT_MS}`,
    )
    expect(() => normalizeCiActTimeoutMs(0)).toThrow('--timeout-ms must be a positive integer')

    await expect(
      runCiActCommand(
        { workflow: 'ci-e2e', execute: true, timeoutMs: MAX_CI_ACT_TIMEOUT_MS + 1 },
        {
          cwd: '/repo',
          run: vi.fn(),
        },
      ),
    ).rejects.toThrow(`--timeout-ms must be <= ${MAX_CI_ACT_TIMEOUT_MS}`)
  })

  it('returns nonzero when the child is terminated by signal', async () => {
    const code = await runCiActCommand(
      { workflow: 'ci-e2e', execute: true },
      {
        cwd: '/repo',
        run: async () => ({
          exitCode: 143,
          signal: 'SIGTERM',
          timedOut: false,
          aborted: false,
          stdout: '',
          stderr: '',
        }),
      },
    )

    expect(code).toBe(143)
  })

  it('does not require repo-local adapter or wrapper paths', () => {
    expect(validateCiActCommand()).toBeNull()
  })
})
