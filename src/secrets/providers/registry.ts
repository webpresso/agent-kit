import {
  type BuiltInProviderType,
  BUILT_IN_PROVIDER_TYPES,
  type SecretProviderPlugin,
} from './types.js'

const BUILT_IN_PROVIDER_REGISTRY: ReadonlyMap<BuiltInProviderType, SecretProviderPlugin> = new Map([
  [
    'doppler',
    {
      id: 'doppler',
      authModes: {
        local: 'cli-login',
        ci: ['oidc', 'service-token'],
      },
      capabilities: {
        profiles: ['preview', 'production'],
        sinks: [
          'dev-server',
          'test',
          'e2e',
          'deploy-wrangler',
          'pulumi',
          'act',
          'github-actions-bootstrap',
          'db-branch',
        ],
        bootstrap: ['github-actions-bootstrap', 'manual'],
      },
    },
  ],
  [
    'infisical',
    {
      id: 'infisical',
      authModes: {
        local: 'cli-login',
        ci: ['oidc'],
      },
      capabilities: {
        profiles: ['preview', 'production'],
        sinks: [
          'dev-server',
          'test',
          'e2e',
          'deploy-wrangler',
          'pulumi',
          'act',
          'github-actions-bootstrap',
          'db-branch',
        ],
        bootstrap: ['github-actions-bootstrap', 'manual'],
      },
    },
  ],
])

export function createBuiltInProviderRegistry(): Map<BuiltInProviderType, SecretProviderPlugin> {
  return new Map(BUILT_IN_PROVIDER_REGISTRY)
}

export function isBuiltInProviderType(value: unknown): value is BuiltInProviderType {
  return typeof value === 'string' && BUILT_IN_PROVIDER_TYPES.includes(value as BuiltInProviderType)
}

export function getProviderPlugin(providerId: string): SecretProviderPlugin {
  if (!isBuiltInProviderType(providerId)) {
    throw new Error(`Unknown built-in secret provider: ${providerId}`)
  }
  const plugin = BUILT_IN_PROVIDER_REGISTRY.get(providerId)
  if (!plugin) {
    throw new Error(`Unknown built-in secret provider: ${providerId}`)
  }
  return plugin
}
