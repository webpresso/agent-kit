import { describe, expect, it } from 'vitest'

import { diagnoseDopplerProvider, dopplerProviderPlugin, planDopplerBootstrap } from './doppler.js'

describe('doppler provider adapter', () => {
  it('reports workspace-scoped remediation', () => {
    expect(
      diagnoseDopplerProvider({
        provider: {
          type: 'doppler',
          workspace: 'ozby',
          workspaceId: '7abb07fb8507f57c2011',
          project: 'ingest-lens',
        },
        profileName: 'preview',
        environment: 'stg',
      }),
    ).toMatchObject({
      code: 'WP_SECRETS_PROVIDER_READY',
      fix: 'If auth drifts, run: doppler login --scope ozby',
    })
  })

  it('plans lane-scoped bootstrap secrets', () => {
    expect(
      planDopplerBootstrap({
        provider: { type: 'doppler', workspace: 'ozby', project: 'ingest-lens' },
        profileName: 'production',
        environment: 'prd',
        lanes: ['preview_main', 'prd'],
      }),
    ).toEqual({
      mode: 'service-token',
      lanes: ['preview_main', 'prd'],
      requiredSecrets: ['CI_SECRET_PROVIDER_TOKEN_PREVIEW', 'CI_SECRET_PROVIDER_TOKEN_PRODUCTION'],
    })
  })

  it('exposes the built-in doppler plugin contract', () => {
    expect(dopplerProviderPlugin.id).toBe('doppler')
    expect(dopplerProviderPlugin.authModes.ci).toContain('service-token')
  })
})
