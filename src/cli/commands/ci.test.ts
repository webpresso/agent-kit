import { describe, expect, it, vi } from 'vitest'

import { buildCiActCommand, runCiActCommand, validateCiActCommand } from './ci'

describe('wp ci command', () => {
  it('builds a public secret-gate act command by default', () => {
    const command = buildCiActCommand({ workflow: 'ci-e2e' }, '/repo')

    expect(command.command).toBe('with-secrets')
    expect(command.args).toEqual([
      '--env-profile',
      'secrets-only',
      '--',
      'act',
      'pull_request',
      '-W',
      '/repo/.github/workflows/ci-e2e.yml',
      '-P',
      'ubicloud-standard-2=ghcr.io/catthehacker/ubuntu:full-latest',
      '--rm',
      '--container-architecture',
      'linux/amd64',
    ])
  })

  it('forwards only documented safe act options', () => {
    const command = buildCiActCommand(
      {
        workflowPath: '.github/workflows/ci.yml',
        execute: true,
        job: 'webpresso',
        eventName: 'workflow_dispatch',
        envProfile: 'ci-local',
        containerArchitecture: 'linux/arm64',
        platformImage: 'image',
        eventPath: 'event.json',
      },
      '/repo',
    )

    expect(command.args).toEqual([
      '--env-profile',
      'ci-local',
      '--',
      'act',
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
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('with-secrets'))
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
      envProfile: undefined,
      command: 'act',
      timeoutMs: undefined,
      args: [
        'pull_request',
        '-W',
        '/repo/.github/workflows/ci-e2e.yml',
        '-P',
        'ubicloud-standard-2=ghcr.io/catthehacker/ubuntu:full-latest',
        '--rm',
        '--container-architecture',
        'linux/amd64',
      ],
    })
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
