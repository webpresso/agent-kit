import { dopplerProviderPlugin } from './doppler.js'
import { infisicalProviderPlugin } from './infisical.js'
import {
  BUILTIN_SECRET_PROVIDER_TYPES,
  type SecretProviderPlugin,
  type SecretProviderPluginId,
} from './types.js'

export const BUILTIN_SECRET_PROVIDER_REGISTRY = new Map<
  SecretProviderPluginId,
  SecretProviderPlugin
>([
  [dopplerProviderPlugin.id, dopplerProviderPlugin],
  [infisicalProviderPlugin.id, infisicalProviderPlugin],
])

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
