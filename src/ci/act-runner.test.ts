import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PLATFORM_IMAGE,
  assertNoForbiddenCiActArgs,
  assertSupportedDefaultPlatformImageArchitecture,
  buildPublicCiActArgs,
  buildPublicCiActCommand,
  resolveDefaultContainerArchitecture,
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

  it('defaults to linux/arm64 on Apple Silicon macOS', () => {
    expect(resolveDefaultContainerArchitecture('darwin', 'arm64')).toBe('linux/arm64')
  })

  it('defaults to linux/amd64 on Intel macOS', () => {
    expect(resolveDefaultContainerArchitecture('darwin', 'x64')).toBe('linux/amd64')
  })

  it('defaults to linux/amd64 on Linux arm64', () => {
    expect(resolveDefaultContainerArchitecture('linux', 'arm64')).toBe('linux/amd64')
  })

  it('accepts the shipped default act image for both supported architectures', () => {
    expect(() =>
      assertSupportedDefaultPlatformImageArchitecture(DEFAULT_PLATFORM_IMAGE, 'linux/amd64'),
    ).not.toThrow()
    expect(() =>
      assertSupportedDefaultPlatformImageArchitecture(DEFAULT_PLATFORM_IMAGE, 'linux/arm64'),
    ).not.toThrow()
    expect(() =>
      assertSupportedDefaultPlatformImageArchitecture(DEFAULT_PLATFORM_IMAGE, 'linux/s390x'),
    ).toThrow(`Unsupported container architecture "linux/s390x"`)
  })

  it('wraps act through wp secrets run', () => {
    const command = buildPublicCiActCommand({ cwd: '/repo', workflow: 'ci-e2e' })

    expect(command.command).toBe('wp')
    expect(command.args.slice(0, 8)).toEqual([
      'secrets',
      'run',
      '--sink',
      'act',
      '--profile',
      'preview',
      '--',
      'act',
    ])
  })

  it('keeps provider environment selectors separate from runtime profiles', () => {
    const command = buildPublicCiActCommand({
      cwd: '/repo',
      workflow: 'ci-e2e',
      envProfile: 'secrets-only',
      secretEnvProfile: 'dev',
    })

    expect(command.command).toBe('wp')
    expect(command.args.slice(0, 8)).toEqual([
      'secrets',
      'run',
      '--sink',
      'act',
      '--profile',
      'dev',
      '--',
      'act',
    ])
  })

  it('uses direct act invocation for no-secret profiles', () => {
    const command = buildPublicCiActCommand({
      cwd: '/repo',
      workflow: 'ci-e2e',
      envProfile: 'public',
      containerArchitecture: 'linux/arm64',
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
      'linux/arm64',
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
