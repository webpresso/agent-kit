import { dopplerProviderPlugin } from "./doppler.js";
import { infisicalProviderPlugin } from "./infisical.js";
import {
  BUILT_IN_PROVIDER_TYPES,
  BUILTIN_SECRET_PROVIDER_TYPES,
  type BuiltInProviderType,
  type SecretProviderPlugin,
} from "./types.js";

const BUILT_IN_PROVIDER_REGISTRY: ReadonlyMap<BuiltInProviderType, SecretProviderPlugin> = new Map([
  [dopplerProviderPlugin.id, dopplerProviderPlugin],
  [infisicalProviderPlugin.id, infisicalProviderPlugin],
]);

export const BUILTIN_SECRET_PROVIDER_REGISTRY = BUILT_IN_PROVIDER_REGISTRY;

export function createBuiltInProviderRegistry(): Map<BuiltInProviderType, SecretProviderPlugin> {
  return new Map(BUILT_IN_PROVIDER_REGISTRY);
}

export function isBuiltInProviderType(value: unknown): value is BuiltInProviderType {
  return (
    typeof value === "string" && BUILT_IN_PROVIDER_TYPES.includes(value as BuiltInProviderType)
  );
}

export function getProviderPlugin(providerId: string): SecretProviderPlugin {
  if (!isBuiltInProviderType(providerId)) {
    throw new Error(`Unknown built-in secret provider: ${providerId}`);
  }
  const plugin = BUILT_IN_PROVIDER_REGISTRY.get(providerId);
  if (!plugin) {
    throw new Error(`Unknown built-in secret provider: ${providerId}`);
  }
  return plugin;
}

export function getSecretProviderPlugin(providerId: string): SecretProviderPlugin {
  if (!isBuiltInProviderType(providerId)) {
    throw new Error(
      `Unsupported provider "${providerId}". Allowlisted built-ins: ${BUILTIN_SECRET_PROVIDER_TYPES.join(", ")}`,
    );
  }
  return getProviderPlugin(providerId);
}

export function redactProviderEvidence(
  providerId: string,
  text: string,
  values: readonly string[],
): string {
  const policy = getSecretProviderPlugin(providerId).redactionPolicy({ values });
  return policy.values.reduce((current, value) => current.split(value).join("[REDACTED]"), text);
}
