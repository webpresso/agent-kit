export type SecretManagerName = "doppler" | "infisical";
export interface SecretsConfigProfile {
    readonly environment: string;
}
export interface SecretsConfig {
    readonly manager: SecretManagerName;
    readonly projectId: string;
    readonly projectLabel?: string;
    readonly profiles?: Readonly<Record<string, SecretsConfigProfile>>;
}
export declare function getRuntimeSecretsConfigPath(cwd?: string): string | null;
export declare function getCommittedSecretsConfigPath(cwd?: string): string;
export declare function getPreferredSecretsConfigPath(cwd?: string): string;
export declare function isSecretLikeMetadataText(value: string): boolean;
export declare function sanitizeSecretsMetadataText(value: string): string;
export declare function readSecretsConfig(cwd?: string): SecretsConfig | null;
export declare function resolveSecretsConfigProfile(profileId: string, cwd?: string): SecretsConfigProfile;
export declare function resolveSecretsConfigProfileEnvironment(profileId: string, cwd?: string): string;
//# sourceMappingURL=secrets-config.d.ts.map