export declare const SECRET_SINK_NAMES: readonly ["dev-server", "test", "e2e", "deploy-wrangler", "pulumi", "act", "github-actions-bootstrap", "db-branch"];
export declare const BUILTIN_SECRET_SINKS: readonly ["dev-server", "test", "e2e", "deploy-wrangler", "pulumi", "act", "github-actions-bootstrap", "db-branch"];
export type SecretSinkName = (typeof SECRET_SINK_NAMES)[number];
export type SecretSinkId = SecretSinkName;
export declare const SECRET_SINK_OPERATIONS: readonly ["run", "preview", "deploy", "up", "verify", "apply", "rotate", "revoke", "replay", "create", "connect", "cleanup"];
export type SecretSinkOperation = (typeof SECRET_SINK_OPERATIONS)[number];
export type SecretRuntimeProfile = 'none' | 'secrets-only' | 'service-runtime' | 'database' | 'full';
export interface SecretSinkDefinition {
    readonly defaultProfile: string;
    readonly allowedOps: readonly SecretSinkOperation[];
}
export interface SecretSinkPlanInput {
    readonly sink: string;
    readonly profile?: string;
    readonly op: string;
}
export interface ResolvedSecretSinkPlan {
    readonly sink: SecretSinkName;
    readonly op: SecretSinkOperation;
    readonly profile: string;
    readonly provider: string;
    readonly providerId: string;
    readonly providerType: string;
    readonly environment: string;
    readonly allowedOps: readonly SecretSinkOperation[];
    readonly runtimeProfile: SecretRuntimeProfile;
    readonly docsPath: string;
    readonly requiresBootstrap: boolean;
}
//# sourceMappingURL=types.d.ts.map