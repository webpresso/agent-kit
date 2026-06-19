export type SecretManagerName = 'doppler' | 'infisical';
export interface SecretsConfig {
    readonly manager: SecretManagerName;
    readonly projectId: string;
    readonly projectLabel?: string;
}
export declare function getRuntimeSecretsConfigPath(cwd?: string): string | null;
export declare function getCommittedSecretsConfigPath(cwd?: string): string;
export declare function getPreferredSecretsConfigPath(cwd?: string): string;
export declare function readSecretsConfig(cwd?: string): SecretsConfig | null;
//# sourceMappingURL=secrets-config.d.ts.map