import type { ProviderBootstrapInput, ProviderBootstrapPlan, ProviderDoctorInput, ProviderDoctorReport, ProviderProfileFetchInput, ResolvedSecretMaterial, SecretProviderPlugin, SecretProviderRedactionInput, SecretProviderRedactionPolicy } from './types.js';
export declare function createDopplerRedactionPolicy(input: SecretProviderRedactionInput): SecretProviderRedactionPolicy;
export declare function diagnoseDopplerProvider(input: ProviderDoctorInput): ProviderDoctorReport;
export declare function fetchDopplerProfile(input: ProviderProfileFetchInput): ResolvedSecretMaterial;
export declare function planDopplerBootstrap(input: ProviderBootstrapInput): ProviderBootstrapPlan;
export declare const dopplerProviderPlugin: SecretProviderPlugin;
//# sourceMappingURL=doppler.d.ts.map