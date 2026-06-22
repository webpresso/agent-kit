import { describe, expect, it, vi } from 'vitest'

import { createGitHubSecretSetInvocation, runSecretsCommand } from './secrets.js'

function makeWriter() {
  const chunks: string[] = []
  return {
    writer: {
      write: (value: string) => {
        chunks.push(value)
        return true
      },
    },
    output: () => chunks.join(''),
  }
}

const config = {
  schemaVersion: 1,
  providers: {
    default: {
      type: 'doppler',
      workspace: 'ozby',
      workspaceId: '7abb07fb8507f57c2011',
      project: 'ingest-lens',
    },
  },
  profiles: {
    preview: { provider: 'default', environment: 'stg' },
    production: { provider: 'default', environment: 'prd' },
  },
  sinks: {
    'dev-server': { defaultProfile: 'preview', allowedOps: ['run'] },
    test: { defaultProfile: 'preview', allowedOps: ['run'] },
    e2e: { defaultProfile: 'preview', allowedOps: ['run'] },
    'deploy-wrangler': { defaultProfile: 'production', allowedOps: ['preview', 'deploy'] },
    pulumi: { defaultProfile: 'preview', allowedOps: ['preview', 'up'] },
    act: { defaultProfile: 'preview', allowedOps: ['replay', 'run'] },
    'github-actions-bootstrap': {
      defaultProfile: 'production',
      allowedOps: ['verify', 'apply', 'rotate', 'revoke'],
    },
    'db-branch': { defaultProfile: 'preview', allowedOps: ['create', 'connect', 'cleanup'] },
  },
} as const

describe('wp secrets', () => {
  it('returns actionable doctor JSON', async () => {
    const stdout = makeWriter()
    const exitCode = await runSecretsCommand(
      'doctor',
      undefined,
      { profile: 'preview', sink: 'dev-server', json: true },
      { readConfig: () => config, stdout: stdout.writer },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: true,
      code: 'WP_SECRETS_DOCTOR_OK',
      plan: { provider: 'doppler', environment: 'stg' },
    })
  })

  it('plans GitHub bootstrap by lane-named secret', async () => {
    const stdout = makeWriter()
    const exitCode = await runSecretsCommand(
      'bootstrap',
      'github',
      { profile: 'production', json: true, lanes: ['preview_main', 'prd'] },
      { readConfig: () => config, stdout: stdout.writer },
    )

    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.output())).toMatchObject({
      ok: true,
      code: 'WP_GITHUB_BOOTSTRAP_PLANNED',
      plan: {
        requiredSecrets: [
          'CI_SECRET_PROVIDER_TOKEN_PREVIEW',
          'CI_SECRET_PROVIDER_TOKEN_PRODUCTION',
        ],
      },
    })
  })

  it('applies bootstrap through gh when values are available', async () => {
    const stdout = makeWriter()
    const apply = vi.fn()

    const exitCode = await runSecretsCommand(
      'bootstrap',
      'github',
      { profile: 'production', json: true, lanes: ['prd'], apply: true },
      {
        readConfig: () => config,
        stdout: stdout.writer,
        runGitHubSecretSet: apply,
        env: { CI_SECRET_PROVIDER_TOKEN_PRODUCTION: 'secret-value' },
      },
    )
    expect(exitCode).toBe(0)
    expect(apply).toHaveBeenCalledWith(
      'CI_SECRET_PROVIDER_TOKEN_PRODUCTION',
      'secret-value',
      undefined,
    )
  })

  it('passes GitHub bootstrap secrets through stdin instead of argv', () => {
    const invocation = createGitHubSecretSetInvocation(
      'CI_SECRET_PROVIDER_TOKEN_PRODUCTION',
      'secret-value',
      '/tmp/repo',
    )

    expect(invocation.command).toBe('gh')
    expect(invocation.args).toEqual([
      'secret',
      'set',
      'CI_SECRET_PROVIDER_TOKEN_PRODUCTION',
      '--body-file',
      '-',
    ])
    expect(invocation.args.join(' ')).not.toContain('secret-value')
    expect(invocation.options.input).toBe('secret-value')
    expect(invocation.options.stdio).toEqual(['pipe', 'ignore', 'ignore'])
  })

  it('runs a secret-scoped local command without direct with-secrets usage', async () => {
    const exitCode = await runSecretsCommand(
      'run',
      undefined,
      {
        profile: 'preview',
        sink: 'dev-server',
        argv: ['node', 'wp', 'secrets', 'run', '--', 'vp', 'run', 'dev'],
      },
      {
        readConfig: () => config,
        runSecretScopedCommand: (input) =>
          ({
            status: input.command === 'vp' && input.environment === 'stg' ? 0 : 1,
            error: undefined,
          }) as any,
      },
    )

    expect(exitCode).toBe(0)
  })
})
