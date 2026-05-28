import { describe, expect, it } from 'vitest'

import {
  assertNoForbiddenCiActArgs,
  buildPublicCiActArgs,
  buildPublicCiActCommand,
  resolveCiActWorkflowPath,
  sanitizePublicCiActArgv,
} from './act-runner.js'

describe('public ci act runner contract', () => {
  it('resolves bare workflow ids to GitHub workflow paths', () => {
    expect(resolveCiActWorkflowPath({ workflow: 'ci-e2e' })).toBe('.github/workflows/ci-e2e.yml')
    expect(resolveCiActWorkflowPath({ workflow: '.github/workflows/ci.yml' })).toBe(
      '.github/workflows/ci.yml',
    )
  })

  it('builds only allowlisted public act argv', () => {
    const args = buildPublicCiActArgs({
      cwd: '/repo',
      workflow: 'ci-e2e',
      job: 'test',
      eventName: 'push',
      eventPath: 'event.json',
      containerArchitecture: 'linux/amd64',
    })

    expect(args).toEqual([
      'push',
      '-W',
      '/repo/.github/workflows/ci-e2e.yml',
      '-P',
      'ubicloud-standard-2=ghcr.io/catthehacker/ubuntu:full-latest',
      '--rm',
      '-j',
      'test',
      '-e',
      '/repo/event.json',
      '--container-architecture',
      'linux/amd64',
    ])
    expect(args.join(' ')).not.toContain('--chef-token')
    expect(args.join(' ')).not.toContain('--bind')
    expect(args.join(' ')).not.toContain('--secret')
  })

  it('wraps act through the provider-neutral secret gate', () => {
    const command = buildPublicCiActCommand({ cwd: '/repo', workflow: 'ci-e2e' })

    expect(command.command).toBe('with-secrets')
    expect(command.args.slice(0, 4)).toEqual(['--env-profile', 'secrets-only', '--', 'act'])
  })

  it('uses direct act invocation for no-secret profiles', () => {
    const command = buildPublicCiActCommand({
      cwd: '/repo',
      workflow: 'ci-e2e',
      envProfile: 'public',
    })

    expect(command.command).toBe('act')
    expect(command.args).toEqual([
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

  it('hard-rejects legacy unsafe act flags if a caller tries to append them', () => {
    expect(() => assertNoForbiddenCiActArgs(['--chef-token', 'token'])).toThrow('--chef-token')
    expect(() => assertNoForbiddenCiActArgs(['--bind'])).toThrow('--bind')
    expect(() => assertNoForbiddenCiActArgs(['--secret-file=/tmp/x'])).toThrow('--secret-file')
  })

  it('redacts internal temp secret-file paths from public metadata', () => {
    const sanitized = sanitizePublicCiActArgv({
      command: 'act',
      args: ['--secret-file', '/tmp/wp-ci-act-AbCd/secrets.env'],
      actArgs: ['--secret-file', '/tmp/wp-ci-act-AbCd/secrets.env'],
    })

    expect(sanitized.args).toEqual(['--secret-file', '[INTERNAL_SECRET_FILE]'])
    expect(JSON.stringify(sanitized)).not.toContain('/tmp/wp-ci-act-AbCd/secrets.env')
  })
})
