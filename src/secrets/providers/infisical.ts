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
    fix: 'If auth drifts, refresh the Infisical login or OIDC machine identity.',
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
    mode: 'oidc',
    lanes: input.lanes,
    requiredSecrets: [],
  }
}

export const infisicalProviderPlugin: SecretProviderPlugin = {
  id: 'infisical',
  authModes: {
    local: 'cli-login',
    ci: ['oidc'],
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
