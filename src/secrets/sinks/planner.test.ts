import { describe, expect, it } from 'vitest'

import { parseSecretsSchema } from '#secrets/config/schema.js'
import { resolveSecretSink } from '#secrets/sinks/planner.js'

const fixture = parseSecretsSchema({
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
    e2e: { defaultProfile: 'preview', allowedOps: ['run'] },
    'deploy-wrangler': { defaultProfile: 'production', allowedOps: ['preview', 'deploy'] },
  },
})

describe('resolveSecretSink', () => {
  it('resolves a provider-neutral sink plan through the single orchestration choke point', () => {
    expect(resolveSecretSink(fixture, { sink: 'deploy-wrangler', op: 'deploy' })).toEqual({
      sink: 'deploy-wrangler',
      op: 'deploy',
      profile: 'production',
      environment: 'prd',
      providerId: 'default',
      providerType: 'doppler',
      allowedOps: ['preview', 'deploy'],
    })
  })

  it('rejects unsupported sinks', () => {
    expect(() => resolveSecretSink(fixture, { sink: 'pulumi', op: 'up' })).toThrow(
      'Unsupported secret sink',
    )
  })

  it('rejects unsupported sink operations', () => {
    expect(() => resolveSecretSink(fixture, { sink: 'dev-server', op: 'deploy' })).toThrow(
      'Unsupported operation',
    )
  })
})
