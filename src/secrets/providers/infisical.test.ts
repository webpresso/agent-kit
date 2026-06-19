import { describe, expect, it } from 'vitest'

import {
  diagnoseInfisicalProvider,
  infisicalProviderPlugin,
  planInfisicalBootstrap,
} from './infisical.js'

describe('infisical provider adapter', () => {
  it('treats OIDC identity metadata as non-secret guidance', () => {
    expect(
      diagnoseInfisicalProvider({
        provider: { type: 'infisical', project: 'edge-matte' },
        profileName: 'preview',
        environment: 'stg',
      }),
    ).toMatchObject({
      code: 'WP_SECRETS_PROVIDER_READY',
      evidence: 'provider=infisical project=edge-matte environment=stg',
    })
  })

  it('plans service-token bootstrap until CI OIDC support exists', () => {
    expect(
      planInfisicalBootstrap({
        provider: { type: 'infisical', project: 'edge-matte' },
        profileName: 'production',
        environment: 'prd',
        lanes: ['prd'],
      }),
    ).toEqual({
      mode: 'service-token',
      lanes: ['prd'],
      requiredSecrets: ['CI_SECRET_PROVIDER_TOKEN_PRODUCTION'],
    })
  })

  it('exposes the built-in infisical plugin contract', () => {
    expect(infisicalProviderPlugin.id).toBe('infisical')
    expect(infisicalProviderPlugin.authModes.ci).toEqual(['service-token'])
  })
})
