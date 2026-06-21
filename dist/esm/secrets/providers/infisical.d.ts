import type { ProviderBootstrapInput, ProviderBootstrapPlan, ProviderDoctorInput, ProviderDoctorReport, ProviderProfileFetchInput, ResolvedSecretMaterial, SecretProviderPlugin, SecretProviderRedactionInput, SecretProviderRedactionPolicy } from './types.js';
export declare function createInfisicalRedactionPolicy(input: SecretProviderRedactionInput): SecretProviderRedactionPolicy;
export declare function diagnoseInfisicalProvider(input: ProviderDoctorInput): ProviderDoctorReport;
export declare function fetchInfisicalProfile(input: ProviderProfileFetchInput): ResolvedSecretMaterial;
export declare function planInfisicalBootstrap(input: ProviderBootstrapInput): ProviderBootstrapPlan;
export declare const infisicalProviderPlugin: SecretProviderPlugin;
//# sourceMappingURL=infisical.d.ts.map