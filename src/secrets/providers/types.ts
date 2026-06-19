export const BUILTIN_SECRET_PROVIDER_TYPES = ['doppler', 'infisical'] as const

export type BuiltInSecretProviderType = (typeof BUILTIN_SECRET_PROVIDER_TYPES)[number]
export type SecretProviderPluginId = BuiltInSecretProviderType | (string & {})

export type SecretProviderLocalAuthMode = 'cli-login' | 'keychain'
export type SecretProviderCiAuthMode = 'oidc' | 'service-token'
export type SecretBootstrapCapability = 'github-actions-bootstrap' | 'manual'

export interface SecretProviderDefinition {
  readonly type: SecretProviderPluginId
  readonly workspace?: string
  readonly workspaceId?: string
  readonly project: string
}

export interface SecretProviderProfileDefinition {
  readonly provider: string
  readonly environment: string
}

export interface SecretProviderRedactionInput {
  readonly values: readonly string[]
}

export interface SecretProviderRedactionPolicy {
  readonly values: readonly string[]
}

export interface ProviderDoctorInput {
  readonly provider: SecretProviderDefinition
  readonly profileName: string
  readonly environment: string
}

export interface ProviderDoctorReport {
  readonly ok: boolean
  readonly code: string
  readonly problem: string
  readonly fix?: string
  readonly evidence?: string
}

export interface ProviderProfileFetchInput {
  readonly provider: SecretProviderDefinition
  readonly profileName: string
  readonly environment: string
  readonly cwd?: string
}

export interface ResolvedSecretMaterial {
  readonly environment: Record<string, string>
  readonly redactedValues: readonly string[]
}

export interface ProviderBootstrapInput {
  readonly provider: SecretProviderDefinition
  readonly profileName: string
  readonly environment: string
  readonly lanes: readonly string[]
}

export interface ProviderBootstrapPlan {
  readonly mode: SecretProviderCiAuthMode
  readonly lanes: readonly string[]
  readonly requiredSecrets: readonly string[]
}

export interface SecretProviderPlugin {
  readonly id: SecretProviderPluginId
  readonly authModes: {
    readonly local: SecretProviderLocalAuthMode
    readonly ci: readonly SecretProviderCiAuthMode[]
  }
  readonly capabilities: {
    readonly profiles: readonly string[]
    readonly sinks: readonly string[]
    readonly bootstrap: readonly SecretBootstrapCapability[]
  }
  redactionPolicy(input: SecretProviderRedactionInput): SecretProviderRedactionPolicy
  diagnose(input: ProviderDoctorInput): Promise<ProviderDoctorReport> | ProviderDoctorReport
  fetchProfile(
    input: ProviderProfileFetchInput,
  ): Promise<ResolvedSecretMaterial> | ResolvedSecretMaterial
  planBootstrap?(
    input: ProviderBootstrapInput,
  ): Promise<ProviderBootstrapPlan> | ProviderBootstrapPlan
}
