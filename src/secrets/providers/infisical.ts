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
} from "./types.js";

import { BUILTIN_SECRET_SINKS } from "#secrets/sinks/types.js";

export function createInfisicalRedactionPolicy(
  input: SecretProviderRedactionInput,
): SecretProviderRedactionPolicy {
  return { values: [...new Set(input.values.filter(Boolean))] };
}

export function diagnoseInfisicalProvider(input: ProviderDoctorInput): ProviderDoctorReport {
  const project =
    input.provider.project ??
    input.provider.projectId ??
    input.provider.projectSlug ??
    "unknown-project";
  return {
    ok: true,
    code: "WP_SECRETS_PROVIDER_READY",
    problem: `infisical profile "${input.profileName}" is configured.`,
    fix: "If auth drifts, refresh the Infisical login or CI bootstrap token.",
    evidence: `provider=infisical project=${project} environment=${input.environment}`,
  };
}

export function fetchInfisicalProfile(input: ProviderProfileFetchInput): ResolvedSecretMaterial {
  const project = input.provider.project ?? input.provider.projectId ?? input.provider.projectSlug;
  return {
    environment: {},
    redactedValues: [project, input.environment].filter((value): value is string => Boolean(value)),
  };
}

export function planInfisicalBootstrap(input: ProviderBootstrapInput): ProviderBootstrapPlan {
  return {
    mode: "service-token",
    lanes: input.lanes,
    requiredSecrets: [
      ...new Set(
        input.lanes.map((lane) =>
          lane === "prd"
            ? "CI_SECRET_PROVIDER_TOKEN_PRODUCTION"
            : "CI_SECRET_PROVIDER_TOKEN_PREVIEW",
        ),
      ),
    ],
  };
}

export const infisicalProviderPlugin: SecretProviderPlugin = {
  id: "infisical",
  authModes: {
    local: "cli-login",
    ci: ["oidc", "service-token"],
  },
  capabilities: {
    profiles: ["preview", "production"],
    sinks: BUILTIN_SECRET_SINKS,
    bootstrap: ["github-actions-bootstrap", "manual"],
  },
  redactionPolicy: createInfisicalRedactionPolicy,
  diagnose: diagnoseInfisicalProvider,
  fetchProfile: fetchInfisicalProfile,
  planBootstrap: planInfisicalBootstrap,
};
