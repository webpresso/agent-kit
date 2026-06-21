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

export type SecretSinkName = (typeof SECRET_SINK_NAMES)[number]

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

export interface SecretSinkDefinition {
  readonly defaultProfile: string
  readonly allowedOps: readonly SecretSinkOperation[]
}
