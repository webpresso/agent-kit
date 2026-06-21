export const SECRET_SINK_NAMES = [
  'dev-server',
  'test',
  'e2e',
  'deploy-wrangler',
  'pulumi',
  'act',
  'github-actions-bootstrap',
  'db-branch',
] as const
export const BUILTIN_SECRET_SINKS = SECRET_SINK_NAMES

export type SecretSinkName = (typeof SECRET_SINK_NAMES)[number]
export type SecretSinkId = SecretSinkName

export const SECRET_SINK_OPERATIONS = [
  'run',
  'preview',
  'deploy',
  'up',
  'verify',
  'apply',
  'rotate',
  'revoke',
  'replay',
  'create',
  'connect',
  'cleanup',
] as const

export type SecretSinkOperation = (typeof SECRET_SINK_OPERATIONS)[number]
export type SecretRuntimeProfile = 'none' | 'secrets-only' | 'service-runtime' | 'database' | 'full'

export interface SecretSinkDefinition {
  readonly defaultProfile: string
  readonly allowedOps: readonly SecretSinkOperation[]
}

export interface SecretSinkPlanInput {
  readonly sink: string
  readonly profile?: string
  readonly op: string
}

export interface ResolvedSecretSinkPlan {
  readonly sink: SecretSinkName
  readonly op: SecretSinkOperation
  readonly profile: string
  readonly provider: string
  readonly providerId: string
  readonly providerType: string
  readonly environment: string
  readonly allowedOps: readonly SecretSinkOperation[]
  readonly runtimeProfile: SecretRuntimeProfile
  readonly docsPath: string
  readonly requiresBootstrap: boolean
}
