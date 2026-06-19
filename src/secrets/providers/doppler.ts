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

export function createDopplerRedactionPolicy(
  input: SecretProviderRedactionInput,
): SecretProviderRedactionPolicy {
  return { values: [...new Set(input.values.filter(Boolean))] }
}

export function diagnoseDopplerProvider(input: ProviderDoctorInput): ProviderDoctorReport {
  const workspace = input.provider.workspace ?? 'unknown-workspace'
  return {
    ok: true,
    code: 'WP_SECRETS_PROVIDER_READY',
    problem: `doppler profile "${input.profileName}" is configured.`,
    fix: `If auth drifts, run: doppler login --scope ${workspace}`,
    evidence: `provider=doppler workspace=${workspace} environment=${input.environment}`,
  }
}

export function fetchDopplerProfile(
  input: ProviderProfileFetchInput,
): ResolvedSecretMaterial {
  return {
    environment: {},
    redactedValues: [input.provider.project, input.environment],
  }
}

export function planDopplerBootstrap(input: ProviderBootstrapInput): ProviderBootstrapPlan {
  return {
    mode: 'service-token',
    lanes: input.lanes,
    requiredSecrets: input.lanes.map((lane) =>
      lane === 'prd'
        ? 'CI_SECRET_PROVIDER_TOKEN_PRODUCTION'
        : `CI_SECRET_PROVIDER_TOKEN_${lane.replace(/^preview_/u, 'PREVIEW_').toUpperCase()}`,
    ),
  }
}

export const dopplerProviderPlugin: SecretProviderPlugin = {
  id: 'doppler',
  authModes: {
    local: 'cli-login',
    ci: ['oidc', 'service-token'],
  },
  capabilities: {
    profiles: ['preview', 'production'],
    sinks: BUILTIN_SECRET_SINKS,
    bootstrap: ['github-actions-bootstrap', 'manual'],
  },
  redactionPolicy: createDopplerRedactionPolicy,
  diagnose: diagnoseDopplerProvider,
  fetchProfile: fetchDopplerProfile,
  planBootstrap: planDopplerBootstrap,
}
