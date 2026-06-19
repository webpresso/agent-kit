export const BUILT_IN_PROVIDER_TYPES = ['doppler', 'infisical'] as const

export type BuiltInProviderType = (typeof BUILT_IN_PROVIDER_TYPES)[number]

export type SecretProviderLocalAuthMode = 'cli-login' | 'keychain'
export type SecretProviderCiAuthMode = 'oidc' | 'service-token'
export type SecretProviderBootstrapCapability = 'github-actions-bootstrap' | 'manual'

export interface SecretProviderPlugin {
  readonly id: BuiltInProviderType
  readonly authModes: {
    readonly local: SecretProviderLocalAuthMode
    readonly ci: readonly SecretProviderCiAuthMode[]
  }
  readonly capabilities: {
    readonly profiles: readonly string[]
    readonly sinks: readonly string[]
    readonly bootstrap: readonly SecretProviderBootstrapCapability[]
  }
}
