import { type BuiltInProviderType, type SecretProviderPlugin } from './types.js';
export declare const BUILTIN_SECRET_PROVIDER_REGISTRY: ReadonlyMap<"doppler" | "infisical", SecretProviderPlugin>;
export declare function createBuiltInProviderRegistry(): Map<BuiltInProviderType, SecretProviderPlugin>;
export declare function isBuiltInProviderType(value: unknown): value is BuiltInProviderType;
export declare function getProviderPlugin(providerId: string): SecretProviderPlugin;
export declare function getSecretProviderPlugin(providerId: string): SecretProviderPlugin;
export declare function redactProviderEvidence(providerId: string, text: string, values: readonly string[]): string;
//# sourceMappingURL=registry.d.ts.map