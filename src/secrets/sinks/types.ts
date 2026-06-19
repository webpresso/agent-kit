export const BUILTIN_SECRET_SINKS = [
  'dev-server',
  'test',
  'e2e',
  'deploy-wrangler',
  'pulumi',
  'act',
  'github-actions-bootstrap',
  'db-branch',
] as const

export type SecretSinkId = (typeof BUILTIN_SECRET_SINKS)[number]

export interface SecretSinkDefinition {
  readonly defaultProfile: string
  readonly allowedOps: readonly string[]
}

export interface SecretSinkPlanInput {
  readonly sink: string
  readonly profile?: string
  readonly op: string
}

export type SecretRuntimeProfile = 'none' | 'secrets-only' | 'service-runtime' | 'database' | 'full'

export interface ResolvedSecretSinkPlan {
  readonly sink: SecretSinkId
  readonly op: string
  readonly profile: string
  readonly provider: string
  readonly environment: string
  readonly runtimeProfile: SecretRuntimeProfile
  readonly docsPath: string
  readonly requiresBootstrap: boolean
}
