import type {
  ProviderBootstrapInput,
  ProviderBootstrapPlan,
  ProviderDoctorInput,
  ProviderDoctorReport,
  ProviderProfileFetchInput,
  ResolvedSecretMaterial,
  SecretProviderPlugin,
  SecretProviderRedactionInput,
  SecretProviderRedactionPolicy,
} from './types.js'

import { BUILTIN_SECRET_SINKS } from '#secrets/sinks/types.js'

export function createInfisicalRedactionPolicy(
  input: SecretProviderRedactionInput,
): SecretProviderRedactionPolicy {
  return { values: [...new Set(input.values.filter(Boolean))] }
}

export function diagnoseInfisicalProvider(input: ProviderDoctorInput): ProviderDoctorReport {
  return {
    ok: true,
    code: 'WP_SECRETS_PROVIDER_READY',
    problem: `infisical profile "${input.profileName}" is configured.`,
    fix: 'If auth drifts, refresh the Infisical login or CI bootstrap token.',
    evidence: `provider=infisical project=${input.provider.project} environment=${input.environment}`,
  }
}

export function fetchInfisicalProfile(
  input: ProviderProfileFetchInput,
): ResolvedSecretMaterial {
  return {
    environment: {},
    redactedValues: [input.provider.project, input.environment],
  }
}

export function planInfisicalBootstrap(input: ProviderBootstrapInput): ProviderBootstrapPlan {
  return {
    mode: 'service-token',
    lanes: input.lanes,
    requiredSecrets: [...new Set(input.lanes.map((lane) => (lane === 'prd' ? 'CI_SECRET_PROVIDER_TOKEN_PRODUCTION' : 'CI_SECRET_PROVIDER_TOKEN_PREVIEW')))],
  }
}

export const infisicalProviderPlugin: SecretProviderPlugin = {
  id: 'infisical',
  authModes: {
    local: 'cli-login',
    ci: ['service-token'],
  },
  capabilities: {
    profiles: ['preview', 'production'],
    sinks: BUILTIN_SECRET_SINKS,
    bootstrap: ['github-actions-bootstrap', 'manual'],
  },
  redactionPolicy: createInfisicalRedactionPolicy,
  diagnose: diagnoseInfisicalProvider,
  fetchProfile: fetchInfisicalProfile,
  planBootstrap: planInfisicalBootstrap,
}
