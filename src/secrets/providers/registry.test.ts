import { describe, expect, it } from 'vitest'

import { getSecretProviderPlugin, redactProviderEvidence } from './registry.js'

describe('secret provider registry', () => {
  it('registers Doppler and Infisical as explicit built-ins', () => {
    expect(getSecretProviderPlugin('doppler').id).toBe('doppler')
    expect(getSecretProviderPlugin('infisical').id).toBe('infisical')
  })

  it('plans Infisical bootstrap through the concrete built-in plugin', () => {
    expect(getSecretProviderPlugin('infisical').authModes.ci).toEqual(['service-token'])
    expect(getSecretProviderPlugin('infisical').planBootstrap?.({
      provider: { type: 'infisical', project: 'demo' },
      profileName: 'preview',
      environment: 'dev',
      lanes: ['preview_main', 'prd'],
    })).toEqual({
      mode: 'service-token',
      lanes: ['preview_main', 'prd'],
      requiredSecrets: ['CI_SECRET_PROVIDER_TOKEN_PREVIEW', 'CI_SECRET_PROVIDER_TOKEN_PRODUCTION'],
    })
  })

  it('rejects unknown providers', () => {
    expect(() => getSecretProviderPlugin('vault')).toThrow('Unsupported provider "vault"')
  })

  it('redacts canary secret values', () => {
    expect(
      redactProviderEvidence(
        'doppler',
        'preview token preview-secret-123 should never leak',
        ['preview-secret-123'],
      ),
    ).toBe('preview token [REDACTED] should never leak')
  })
})
