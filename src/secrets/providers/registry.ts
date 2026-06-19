import {
  BUILTIN_SECRET_PROVIDER_TYPES,
  type ProviderBootstrapInput,
  type ProviderBootstrapPlan,
  type ProviderDoctorInput,
  type ProviderDoctorReport,
  type ProviderProfileFetchInput,
  type ResolvedSecretMaterial,
  type SecretProviderPlugin,
  type SecretProviderPluginId,
  type SecretProviderRedactionInput,
  type SecretProviderRedactionPolicy,
} from './types.js'

import { BUILTIN_SECRET_SINKS } from '#secrets/sinks/types.js'

function createRedactionPolicy(input: SecretProviderRedactionInput): SecretProviderRedactionPolicy {
  const values = [...new Set(input.values.map((value) => value.trim()).filter(Boolean))]
  return { values }
}

function createDoctorReport(
  providerId: SecretProviderPluginId,
  input: ProviderDoctorInput,
): ProviderDoctorReport {
  return {
    ok: true,
    code: 'WP_SECRETS_PROVIDER_READY',
    problem: `${providerId} profile "${input.profileName}" is configured.`,
    evidence: `provider=${providerId} workspace=${input.provider.workspace ?? 'n/a'} environment=${input.environment}`,
  }
}

function createBootstrapPlan(
  providerId: SecretProviderPluginId,
  input: ProviderBootstrapInput,
): ProviderBootstrapPlan {
  const suffixes = input.lanes.map((lane) =>
    lane === 'prd' ? 'PRODUCTION' : lane.replace(/^preview_/u, 'PREVIEW_').toUpperCase(),
  )
  return {
    mode: providerId === 'infisical' ? 'oidc' : 'service-token',
    lanes: input.lanes,
    requiredSecrets: suffixes.map((suffix) => `CI_SECRET_PROVIDER_TOKEN_${suffix}`),
  }
}

function createFetchProfile(
  input: ProviderProfileFetchInput,
): ResolvedSecretMaterial {
  return {
    environment: {},
    redactedValues: [input.provider.project, input.environment],
  }
}

function createPlugin(id: (typeof BUILTIN_SECRET_PROVIDER_TYPES)[number]): SecretProviderPlugin {
  return {
    id,
    authModes: {
      local: 'cli-login',
      ci: id === 'infisical' ? ['oidc'] : ['oidc', 'service-token'],
    },
    capabilities: {
      profiles: ['preview', 'production'],
      sinks: BUILTIN_SECRET_SINKS,
      bootstrap: ['github-actions-bootstrap', 'manual'],
    },
    redactionPolicy: createRedactionPolicy,
    diagnose: (input) => createDoctorReport(id, input),
    fetchProfile: createFetchProfile,
    planBootstrap: (input) => createBootstrapPlan(id, input),
  }
}

export const BUILTIN_SECRET_PROVIDER_REGISTRY = new Map<
  SecretProviderPluginId,
  SecretProviderPlugin
>(BUILTIN_SECRET_PROVIDER_TYPES.map((id) => [id, createPlugin(id)]))

export function getSecretProviderPlugin(providerId: SecretProviderPluginId): SecretProviderPlugin {
  const plugin = BUILTIN_SECRET_PROVIDER_REGISTRY.get(providerId)
  if (!plugin) {
    throw new Error(`Unsupported provider "${providerId}". Allowlisted built-ins: ${BUILTIN_SECRET_PROVIDER_TYPES.join(', ')}`)
  }
  return plugin
}

export function redactProviderEvidence(
  providerId: SecretProviderPluginId,
  text: string,
  values: readonly string[],
): string {
  const policy = getSecretProviderPlugin(providerId).redactionPolicy({ values })
  return policy.values.reduce((current, value) => current.split(value).join('[REDACTED]'), text)
}
