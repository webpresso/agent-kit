export const BUILT_IN_PROVIDER_TYPES = ['doppler', 'infisical'] as const
export const BUILTIN_SECRET_PROVIDER_TYPES = BUILT_IN_PROVIDER_TYPES

export type BuiltInProviderType = (typeof BUILT_IN_PROVIDER_TYPES)[number]
export type BuiltInSecretProviderType = BuiltInProviderType
export type SecretProviderPluginId = BuiltInProviderType | (string & {})

export type SecretProviderLocalAuthMode = 'cli-login' | 'keychain'
export type SecretProviderCiAuthMode = 'oidc' | 'service-token'
export type SecretProviderBootstrapCapability = 'github-actions-bootstrap' | 'manual'
export type SecretBootstrapCapability = SecretProviderBootstrapCapability

export interface SecretProviderDefinition {
  readonly type: BuiltInProviderType
  readonly project?: string
  readonly workspace?: string
  readonly workspaceId?: string
  readonly projectId?: string
  readonly identityId?: string
  readonly projectSlug?: string
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
  redactionPolicy(input: SecretProviderRedactionInput): SecretProviderRedactionPolicy
  diagnose(input: ProviderDoctorInput): Promise<ProviderDoctorReport> | ProviderDoctorReport
  fetchProfile(
    input: ProviderProfileFetchInput,
  ): Promise<ResolvedSecretMaterial> | ResolvedSecretMaterial
  planBootstrap?(
    input: ProviderBootstrapInput,
  ): Promise<ProviderBootstrapPlan> | ProviderBootstrapPlan
}
