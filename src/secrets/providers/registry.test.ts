import { describe, expect, it } from 'vitest'

import { createBuiltInProviderRegistry, getProviderPlugin } from '#secrets/providers/registry.js'

describe('createBuiltInProviderRegistry', () => {
  it('exposes only the explicit built-in providers', () => {
    const registry = createBuiltInProviderRegistry()

    expect([...registry.keys()].sort()).toEqual(['doppler', 'infisical'])
  })

  it('returns the Doppler workplace-aware plugin contract', () => {
    const plugin = getProviderPlugin('doppler')

    expect(plugin.authModes.local).toBe('cli-login')
    expect(plugin.authModes.ci).toContain('service-token')
    expect(plugin.capabilities.sinks).toContain('deploy-wrangler')
    expect(plugin.capabilities.bootstrap).toContain('github-actions-bootstrap')
  })

  it('returns the Infisical OIDC-first plugin contract', () => {
    const plugin = getProviderPlugin('infisical')

    expect(plugin.authModes.local).toBe('cli-login')
    expect(plugin.authModes.ci).toContain('oidc')
    expect(plugin.capabilities.profiles).toContain('preview')
  })

  it('rejects unknown provider ids', () => {
    expect(() => getProviderPlugin('vault')).toThrow('Unknown built-in secret provider')
  })
})
