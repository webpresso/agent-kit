import {
  type SecretOrchestrationConfig,
  getDefaultSecretProvider,
  parseSecretOrchestrationConfig,
} from '#secrets/config/schema.js'
import { getSecretProviderPlugin } from '#secrets/providers/registry.js'
import { BUILTIN_SECRET_SINKS, type ResolvedSecretSinkPlan, type SecretSinkPlanInput } from './types.js'

const RUNTIME_PROFILE_BY_SINK: Record<string, ResolvedSecretSinkPlan['runtimeProfile']> = {
  'dev-server': 'service-runtime',
  test: 'service-runtime',
  e2e: 'service-runtime',
  'deploy-wrangler': 'full',
  pulumi: 'full',
  act: 'secrets-only',
  'github-actions-bootstrap': 'none',
  'db-branch': 'database',
}

export interface ResolveSecretSinkOptions extends SecretSinkPlanInput {
  readonly config: SecretOrchestrationConfig | unknown
}

export function resolveSecretSink(input: ResolveSecretSinkOptions): ResolvedSecretSinkPlan {
  const config = parseSecretOrchestrationConfig(input.config)
  const sink = config.sinks[input.sink]
  if (!sink || !BUILTIN_SECRET_SINKS.includes(input.sink as (typeof BUILTIN_SECRET_SINKS)[number])) {
    throw new Error(`Unsupported sink "${input.sink}"`)
  }

  const profileName = input.profile ?? sink.defaultProfile
  const profile = config.profiles[profileName]
  if (!profile) {
    throw new Error(`Unknown profile "${profileName}"`)
  }
  if (!sink.allowedOps.includes(input.op)) {
    throw new Error(
      `Unsupported op "${input.op}" for sink "${input.sink}". Allowed ops: ${sink.allowedOps.join(', ')}`,
    )
  }

  const resolvedProvider = config.providers[profile.provider] ?? getDefaultSecretProvider(config)
  if (!resolvedProvider) throw new Error(`Unknown provider "${profile.provider}"`)

  const plugin = getSecretProviderPlugin(resolvedProvider.type)
  if (!plugin.capabilities.sinks.includes(input.sink)) {
    throw new Error(`Provider "${resolvedProvider.type}" does not support sink "${input.sink}"`)
  }

  return {
    sink: input.sink as (typeof BUILTIN_SECRET_SINKS)[number],
    op: input.op,
    profile: profileName,
    provider: resolvedProvider.type,
    environment: profile.environment,
    runtimeProfile: RUNTIME_PROFILE_BY_SINK[input.sink] ?? 'service-runtime',
    docsPath: 'docs/secrets/providers.md',
    requiresBootstrap: input.sink === 'github-actions-bootstrap',
  }
}
