import { describe, expect, it } from 'vitest'

import { resolveSecretSink } from './planner.js'

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

describe('resolveSecretSink', () => {
  it('resolves the provider-neutral sink choke point', () => {
    expect(resolveSecretSink({ config, sink: 'act', op: 'run' })).toEqual({
      sink: 'act',
      op: 'run',
      profile: 'preview',
      provider: 'doppler',
      environment: 'stg',
      runtimeProfile: 'secrets-only',
      docsPath: 'docs/secrets/providers.md',
      requiresBootstrap: false,
    })
  })

  it('rejects unsupported sinks', () => {
    expect(() => resolveSecretSink({ config, sink: 'runtime-shell', op: 'run' })).toThrow(
      'Unsupported sink "runtime-shell"',
    )
  })

  it('rejects unsupported ops', () => {
    expect(() => resolveSecretSink({ config, sink: 'dev-server', op: 'apply' })).toThrow(
      'Unsupported op "apply" for sink "dev-server"',
    )
  })
})
