import type { CAC } from "cac";
type OutputWriter = Pick<NodeJS.WriteStream, "write">;
export type SecretManagerName = "doppler" | "infisical";
export interface SecretsConfig {
    readonly manager: SecretManagerName;
    readonly projectId: string;
    readonly projectLabel?: string;
}
interface SecretManagerAvailability {
    readonly available: boolean;
    readonly detail?: string;
}
interface SecretManagerAuthentication {
    readonly authenticated: boolean;
    readonly detail?: string;
}
interface SecretManagerAdapter {
    readonly displayName: string;
    checkAvailability(): Promise<SecretManagerAvailability>;
    checkAuthentication(options: {
        workspace: string;
    }): Promise<SecretManagerAuthentication>;
}
export interface ConfigCommandOptions {
    readonly cwd?: string;
    readonly json?: boolean;
    readonly label?: string;
}
export interface SecretsConfigStatus {
    readonly configured: boolean;
    readonly path: string;
    readonly config: SecretsConfig | null;
    readonly registered: boolean;
    readonly available?: boolean;
    readonly authenticated?: boolean;
    readonly detail?: string;
}
export interface SecretsConfigCommandDeps {
    readonly getPath?: (cwd?: string) => string;
    readonly readConfig?: (cwd?: string) => SecretsConfig | null;
    readonly writeConfig?: (config: SecretsConfig, cwd?: string) => void;
    readonly setup?: (options?: {
        cwd?: string;
    }) => Promise<{
        manager: SecretManagerName;
        projectId: string;
    }>;
    readonly registry?: Pick<Map<SecretManagerName, SecretManagerAdapter>, "get">;
    readonly stdout?: OutputWriter;
    readonly stderr?: OutputWriter;
}
export declare function runSecretsConfigCommand(action: string | undefined, positional: readonly string[], options?: ConfigCommandOptions, deps?: SecretsConfigCommandDeps): Promise<number>;
export declare function registerConfigCommand(cli: CAC): void;
export {};
//# sourceMappingURL=config.d.ts.map