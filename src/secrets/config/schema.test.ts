import { describe, expect, it } from 'vitest'

import {
  parseSecretsSchema,
  redactSecretsValue,
  type SecretsSchema,
} from '#secrets/config/schema.js'

const dopplerFixture = {
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
} satisfies SecretsSchema

describe('parseSecretsSchema', () => {
  it('accepts the pinned Doppler schema fixture', () => {
    expect(parseSecretsSchema(dopplerFixture)).toEqual(dopplerFixture)
  })

  it('accepts an Infisical fixture', () => {
    const parsed = parseSecretsSchema({
      schemaVersion: 1,
      providers: {
        default: {
          type: 'infisical',
          projectId: 'project_123',
          identityId: 'identity_456',
        },
      },
      profiles: {
        preview: { provider: 'default', environment: 'preview' },
      },
      sinks: {
        act: { defaultProfile: 'preview', allowedOps: ['run', 'replay'] },
      },
    })

    expect(parsed.providers.default.type).toBe('infisical')
    expect(parsed.profiles.preview.environment).toBe('preview')
  })

  it('rejects unknown provider types', () => {
    expect(() =>
      parseSecretsSchema({
        schemaVersion: 1,
        providers: {
          default: {
            type: 'vault',
            projectId: 'ignored',
          },
        },
        profiles: {
          preview: { provider: 'default', environment: 'stg' },
        },
        sinks: {
          'dev-server': { defaultProfile: 'preview', allowedOps: ['run'] },
        },
      }),
    ).toThrow('Unsupported secret provider')
  })
})

describe('redactSecretsValue', () => {
  it('redacts canary secret values inside nested structures', () => {
    const redacted = redactSecretsValue(
      {
        problem: 'bad config',
        evidence: {
          stderr: 'token=CANARY_SECRET_123',
          nested: ['keep', 'CANARY_SECRET_123'],
        },
      },
      ['CANARY_SECRET_123'],
    ) as Record<string, unknown>

    expect(JSON.stringify(redacted)).not.toContain('CANARY_SECRET_123')
    expect(JSON.stringify(redacted)).toContain('[REDACTED]')
  })
})
