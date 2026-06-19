import type { SecretsSchema } from '#secrets/config/schema.js'
import type { SecretSinkName, SecretSinkOperation } from '#secrets/sinks/types.js'

export interface ResolveSecretSinkInput {
  readonly sink: string
  readonly op: string
  readonly profile?: string
}

export interface ResolvedSecretSinkPlan {
  readonly sink: SecretSinkName
  readonly op: SecretSinkOperation
  readonly profile: string
  readonly environment: string
  readonly providerId: string
  readonly providerType: string
  readonly allowedOps: readonly SecretSinkOperation[]
}

export function resolveSecretSink(
  schema: SecretsSchema,
  input: ResolveSecretSinkInput,
): ResolvedSecretSinkPlan {
  const sink = schema.sinks[input.sink]
  if (!sink) {
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

  return {
    sink: input.sink as SecretSinkName,
    op,
    profile: profileId,
    environment: profile.environment,
    providerId: profile.provider,
    providerType: provider.type,
    allowedOps: sink.allowedOps,
  }
}
