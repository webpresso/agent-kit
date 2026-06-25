import type { SecretProviderDefinition } from "#secrets/providers/types.js";
import { type SecretSinkDefinition } from "#secrets/sinks/types.js";
export interface DopplerProviderConfig {
    readonly type: "doppler";
    readonly workspace?: string;
    readonly workspaceId?: string;
    readonly project: string;
}
export interface InfisicalProviderConfig {
    readonly type: "infisical";
    readonly project?: string;
    readonly projectId?: string;
    readonly identityId?: string;
    readonly projectSlug?: string;
}
export type SecretProviderConfig = DopplerProviderConfig | InfisicalProviderConfig;
export interface SecretProfileDefinition {
    readonly provider: string;
    readonly environment: string;
}
export interface SecretsSchema {
    readonly schemaVersion: 1;
    readonly providers: Record<string, SecretProviderConfig>;
    readonly profiles: Record<string, SecretProfileDefinition>;
    readonly sinks: Record<string, SecretSinkDefinition>;
}
export declare function parseSecretsSchema(input: unknown): SecretsSchema;
export declare const SecretOrchestrationConfigSchema: {
    parse: typeof parseSecretsSchema;
    safeParse(input: unknown): {
        success: true;
        data: SecretsSchema;
    } | {
        success: false;
        error: Error;
    };
};
export type SecretOrchestrationConfig = SecretsSchema;
export declare function parseSecretOrchestrationConfig(value: unknown): SecretOrchestrationConfig;
export declare function getDefaultSecretProvider(config: SecretOrchestrationConfig): SecretProviderDefinition | undefined;
export declare function isSecretOrchestrationConfig(value: unknown): value is SecretOrchestrationConfig;
export declare function asSecretSinkDefinitionMap(config: SecretOrchestrationConfig): Record<string, SecretSinkDefinition>;
export declare function redactSecretsValue(value: unknown, secrets: readonly string[]): unknown;
//# sourceMappingURL=schema.d.ts.map