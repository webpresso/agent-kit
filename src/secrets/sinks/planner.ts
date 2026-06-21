import { parseSecretsSchema, type SecretsSchema } from '#secrets/config/schema.js'
import { getProviderPlugin } from '#secrets/providers/registry.js'
import {
  SECRET_SINK_NAMES,
  type ResolvedSecretSinkPlan,
  type SecretRuntimeProfile,
  type SecretSinkName,
  type SecretSinkOperation,
  type SecretSinkPlanInput,
} from '#secrets/sinks/types.js'

const RUNTIME_PROFILE_BY_SINK: Record<SecretSinkName, SecretRuntimeProfile> = {
  'dev-server': 'service-runtime',
  test: 'service-runtime',
  e2e: 'service-runtime',
  'deploy-wrangler': 'full',
  pulumi: 'full',
  act: 'secrets-only',
  'github-actions-bootstrap': 'none',
  'db-branch': 'database',
}

export interface ResolveSecretSinkInput extends SecretSinkPlanInput {}

export interface ResolveSecretSinkOptions extends ResolveSecretSinkInput {
  readonly config: SecretsSchema | unknown
}

function isOptionsObject(value: unknown): value is ResolveSecretSinkOptions {
  return Boolean(value && typeof value === 'object' && 'config' in value)
}

export function resolveSecretSink(
  schema: SecretsSchema,
  input: ResolveSecretSinkInput,
): ResolvedSecretSinkPlan
export function resolveSecretSink(input: ResolveSecretSinkOptions): ResolvedSecretSinkPlan
export function resolveSecretSink(
  schemaOrInput: SecretsSchema | ResolveSecretSinkOptions,
  maybeInput?: ResolveSecretSinkInput,
): ResolvedSecretSinkPlan {
  const schema = isOptionsObject(schemaOrInput)
    ? parseSecretsSchema(schemaOrInput.config)
    : parseSecretsSchema(schemaOrInput)
  const input = isOptionsObject(schemaOrInput) ? schemaOrInput : maybeInput
  if (!input) {
    throw new Error('Missing secret sink resolution input.')
  }

  const sink = schema.sinks[input.sink]
  if (!sink || !SECRET_SINK_NAMES.includes(input.sink as SecretSinkName)) {
    throw new Error(`Unsupported secret sink "${input.sink}".`)
  }

  const op = input.op as SecretSinkOperation
  if (!sink.allowedOps.includes(op)) {
    throw new Error(`Unsupported operation "${input.op}" for sink "${input.sink}".`)
  }

  const profileId = input.profile ?? sink.defaultProfile
  const profile = schema.profiles[profileId]
  if (!profile) {
    throw new Error(`Unknown secret profile "${profileId}".`)
  }

  const provider = schema.providers[profile.provider]
  if (!provider) {
    throw new Error(`Unknown provider "${profile.provider}" for profile "${profileId}".`)
  }

  const plugin = getProviderPlugin(provider.type)
  if (!plugin.capabilities.sinks.includes(input.sink)) {
    throw new Error(`Provider "${provider.type}" does not support sink "${input.sink}".`)
  }

  return {
    sink: input.sink as SecretSinkName,
    op,
    profile: profileId,
    environment: profile.environment,
    provider: provider.type,
    providerId: profile.provider,
    providerType: provider.type,
    allowedOps: sink.allowedOps,
    runtimeProfile: RUNTIME_PROFILE_BY_SINK[input.sink as SecretSinkName],
    docsPath: 'docs/secrets/providers.md',
    requiresBootstrap: input.sink === 'github-actions-bootstrap',
  }
}
