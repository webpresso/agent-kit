export declare const SECRETS_CONFIG_PATH = ".webpresso/secrets.config.json";
export declare const SECRET_VALUE_PATTERN: RegExp;
export type SecretsConfigMetadata = {
    readonly manager: 'doppler' | 'infisical';
    readonly projectId: string;
    readonly projectLabel?: string;
    readonly profiles?: Readonly<Record<string, {
        readonly environment: string;
    }>>;
};
export declare function isForbiddenSecretBasename(name: string): boolean;
export declare function isForbiddenWorkingTreePath(relativePath: string): boolean;
export declare function isForbiddenGitPath(relativePath: string): boolean;
export declare function shouldScanGitFileForSecretValues(relativePath: string): boolean;
export declare function resolveSecretsAuditRoot(rootDirectory?: string): string | null;
export declare function parseSecretsConfigMetadata(raw: string, sourceLabel: string): SecretsConfigMetadata;
//# sourceMappingURL=secrets-policy.d.ts.map