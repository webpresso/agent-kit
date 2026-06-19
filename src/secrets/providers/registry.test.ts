import { describe, expect, it } from 'vitest'

import { getSecretProviderPlugin, redactProviderEvidence } from './registry.js'

describe('secret provider registry', () => {
  it('registers Doppler and Infisical as explicit built-ins', () => {
    expect(getSecretProviderPlugin('doppler').id).toBe('doppler')
    expect(getSecretProviderPlugin('infisical').id).toBe('infisical')
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
