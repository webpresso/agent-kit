import { dopplerProviderPlugin } from './doppler.js';
import { infisicalProviderPlugin } from './infisical.js';
import { BUILT_IN_PROVIDER_TYPES, BUILTIN_SECRET_PROVIDER_TYPES, } from './types.js';
const BUILT_IN_PROVIDER_REGISTRY = new Map([
    [dopplerProviderPlugin.id, dopplerProviderPlugin],
    [infisicalProviderPlugin.id, infisicalProviderPlugin],
]);
export const BUILTIN_SECRET_PROVIDER_REGISTRY = BUILT_IN_PROVIDER_REGISTRY;
export function createBuiltInProviderRegistry() {
    return new Map(BUILT_IN_PROVIDER_REGISTRY);
}
export function isBuiltInProviderType(value) {
    return typeof value === 'string' && BUILT_IN_PROVIDER_TYPES.includes(value);
}
export function getProviderPlugin(providerId) {
    if (!isBuiltInProviderType(providerId)) {
        throw new Error(`Unknown built-in secret provider: ${providerId}`);
    }
    const plugin = BUILT_IN_PROVIDER_REGISTRY.get(providerId);
    if (!plugin) {
        throw new Error(`Unknown built-in secret provider: ${providerId}`);
    }
    return plugin;
}
export function getSecretProviderPlugin(providerId) {
    if (!isBuiltInProviderType(providerId)) {
        throw new Error(`Unsupported provider "${providerId}". Allowlisted built-ins: ${BUILTIN_SECRET_PROVIDER_TYPES.join(', ')}`);
    }
    return getProviderPlugin(providerId);
}
export function redactProviderEvidence(providerId, text, values) {
    const policy = getSecretProviderPlugin(providerId).redactionPolicy({ values });
    return policy.values.reduce((current, value) => current.split(value).join('[REDACTED]'), text);
}
//# sourceMappingURL=registry.js.map