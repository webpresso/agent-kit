import { describe, expect, it } from 'vitest'

import { parseSecretOrchestrationConfig } from './schema.js'

function canonicalConfig(providerType: 'doppler' | 'infisical' = 'doppler') {
  return {
    schemaVersion: 1,
    providers: {
      default: {
        type: providerType,
        workspace: providerType === 'doppler' ? 'ozby' : undefined,
        workspaceId: providerType === 'doppler' ? '7abb07fb8507f57c2011' : undefined,
        project: providerType === 'doppler' ? 'ingest-lens' : 'edge-matte',
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
  }
}

describe('SecretOrchestrationConfigSchema', () => {
  it('accepts the pinned Doppler config example', () => {
    expect(parseSecretOrchestrationConfig(canonicalConfig())).toMatchObject({
      schemaVersion: 1,
      providers: {
        default: expect.objectContaining({ type: 'doppler', project: 'ingest-lens' }),
      },
    })
  })

  it('accepts the pinned Infisical config example', () => {
    expect(parseSecretOrchestrationConfig(canonicalConfig('infisical'))).toMatchObject({
      providers: {
        default: expect.objectContaining({ type: 'infisical', project: 'edge-matte' }),
      },
    })
  })

  it('rejects unknown providers', () => {
    expect(() =>
      parseSecretOrchestrationConfig({
        ...canonicalConfig(),
        providers: { default: { type: 'vault', project: 'demo' } },
      }),
    ).toThrow('Invalid option')
  })

  it('rejects unsupported sinks', () => {
    expect(() =>
      parseSecretOrchestrationConfig({
        ...canonicalConfig(),
        sinks: {
          ...canonicalConfig().sinks,
          'runtime-shell': { defaultProfile: 'preview', allowedOps: ['run'] },
        },
      }),
    ).toThrow(/runtime-shell/u)
  })

  it('rejects configs that omit providers.default', () => {
    expect(() =>
      parseSecretOrchestrationConfig({
        ...canonicalConfig(),
        providers: {
          main: canonicalConfig().providers.default,
        },
      }),
    ).toThrow(/default/u)
  })

  it('rejects invalid project slugs', () => {
    expect(() =>
      parseSecretOrchestrationConfig({
        ...canonicalConfig(),
        providers: {
          default: {
            ...canonicalConfig().providers.default,
            project: 'Edge Matte',
          },
        },
      }),
    ).toThrow(/project slug/u)
  })
})
