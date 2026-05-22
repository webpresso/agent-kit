import { describe, expect, it, vi } from 'vitest'

import { buildCiActCommand, runCiActCommand, validateCiActCommand } from './ci'

describe('ak ci command', () => {
  it('routes act through the repo secret wrapper by default', () => {
    const command = buildCiActCommand({ workflow: 'ci-e2e' }, '/repo')

    expect(command.command).toBe('bun')
    expect(command.args).toEqual([
      '/repo/apps/scripts/src/lib/with-secrets.ts',
      '--env-profile',
      'secrets-only',
      '--',
      'bun',
      '/repo/apps/scripts/src/ci/act.ts',
      '--workflow',
      'ci-e2e',
      '--allow-local-chef-token',
      '--allow-host-mutation',
      '--dry-run',
      '--no-doppler',
    ])
  })

  it('forwards execute and adapter options', () => {
    const command = buildCiActCommand(
      {
        workflow: 'ci-main',
        execute: true,
        job: 'webpresso',
        prNumber: 123,
        repo: 'webpresso/monorepo',
        chefUrl: 'http://host.docker.internal:4003',
        chefToken: 'token',
        allowLocalChefToken: true,
        allowHostMutation: true,
        containerArchitecture: 'linux/arm64',
        platformImage: 'image',
        eventPath: 'event.json',
      },
      '/repo',
    )

    expect(command.args).toContain('--execute')
    expect(command.args).toContain('--job')
    expect(command.args).toContain('webpresso')
    expect(command.args).toContain('--pr-number')
    expect(command.args).toContain('123')
    expect(command.args).toContain('--chef-url')
    expect(command.args).toContain('http://host.docker.internal:4003')
    expect(command.args).toContain('--repo')
    expect(command.args).toContain('webpresso/monorepo')
    expect(command.args).toContain('--chef-token')
    expect(command.args).toContain('token')
    expect(command.args).toContain('--allow-local-chef-token')
    expect(command.args).toContain('--allow-host-mutation')
    expect(command.args).toContain('--container-architecture')
    expect(command.args).toContain('linux/arm64')
    expect(command.args).toContain('--platform-image')
    expect(command.args).toContain('image')
    expect(command.args).toContain('--event-path')
    expect(command.args).toContain('event.json')
  })

  it('supports debug direct mode without the secret wrapper', () => {
    const command = buildCiActCommand({ workflow: 'ci-e2e', direct: true }, '/repo')

    expect(command.command).toBe('bun')
    expect(command.args).toEqual([
      '/repo/apps/scripts/src/ci/act.ts',
      '--workflow',
      'ci-e2e',
      '--allow-local-chef-token',
      '--allow-host-mutation',
      '--dry-run',
    ])
  })

  it('lets callers opt out of default local chef token and host mutation allowances', () => {
    const command = buildCiActCommand(
      { workflow: 'ci-e2e', allowLocalChefToken: false, allowHostMutation: false },
      '/repo',
    )

    expect(command.args).not.toContain('--allow-local-chef-token')
    expect(command.args).not.toContain('--allow-host-mutation')
  })

  it('fails fast when the repo-local adapter is missing', () => {
    const stderr = vi.fn(() => true)
    const code = runCiActCommand(
      { workflow: 'ci-e2e' },
      {
        cwd: '/repo',
        exists: () => false,
        stderr: { write: stderr },
      },
    )

    expect(code).toBe(1)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('No repo-local act adapter'))
  })

  it('fails fast when the default secret wrapper is missing', () => {
    const stderr = vi.fn(() => true)
    const code = runCiActCommand(
      { workflow: 'ci-e2e' },
      {
        cwd: '/repo',
        exists: (path) => path.endsWith('/apps/scripts/src/ci/act.ts'),
        stderr: { write: stderr },
      },
    )

    expect(code).toBe(1)
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('No repo-local secret wrapper'))
  })

  it('lets debug direct mode run without the secret wrapper', () => {
    const run = vi.fn(() => ({
      status: 0,
      signal: null,
      output: [],
      pid: 1,
      stdout: '',
      stderr: '',
    }))
    const code = runCiActCommand(
      { workflow: 'ci-e2e', direct: true },
      {
        cwd: '/repo',
        exists: (path) => path.endsWith('/apps/scripts/src/ci/act.ts'),
        run,
      },
    )

    expect(code).toBe(0)
    expect(run).toHaveBeenCalledWith('bun', [
      '/repo/apps/scripts/src/ci/act.ts',
      '--workflow',
      'ci-e2e',
      '--allow-local-chef-token',
      '--allow-host-mutation',
      '--dry-run',
    ])
  })

  it('returns nonzero when the child is terminated by signal', () => {
    const code = runCiActCommand(
      { workflow: 'ci-e2e' },
      {
        cwd: '/repo',
        exists: () => true,
        run: () => ({
          status: null,
          signal: 'SIGTERM',
          output: [],
          pid: 1,
          stdout: '',
          stderr: '',
        }),
      },
    )

    expect(code).toBe(1)
  })

  it('passes the exact wrapped command to the injected runner by default', () => {
    const run = vi.fn(() => ({
      status: 0,
      signal: null,
      output: [],
      pid: 1,
      stdout: '',
      stderr: '',
    }))
    const code = runCiActCommand(
      { workflow: 'ci-e2e' },
      {
        cwd: '/repo',
        exists: () => true,
        run,
      },
    )

    expect(code).toBe(0)
    expect(run).toHaveBeenCalledWith('bun', [
      '/repo/apps/scripts/src/lib/with-secrets.ts',
      '--env-profile',
      'secrets-only',
      '--',
      'bun',
      '/repo/apps/scripts/src/ci/act.ts',
      '--workflow',
      'ci-e2e',
      '--allow-local-chef-token',
      '--allow-host-mutation',
      '--dry-run',
      '--no-doppler',
    ])
  })

  it('accepts a repo that has both adapter files', () => {
    expect(validateCiActCommand('/repo', () => true)).toBeNull()
  })
})
