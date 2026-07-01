export type RuntimeProfile = "none" | "secrets-only" | "service-runtime" | "database" | "full";
export declare const RUNTIME_PROFILES: readonly ["none", "secrets-only", "service-runtime", "database", "full"];
export declare const SECRET_BACKED_RUNTIME_PROFILES: readonly ["secrets-only", "service-runtime", "database", "full"];
export declare function isRuntimeProfile(value: string | undefined): value is RuntimeProfile;
export declare function isDirectRuntimeProfile(value: string | undefined): boolean;
export declare function needsSecretResolution(value: string | undefined): boolean;
//# sourceMappingURL=profiles.d.ts.map