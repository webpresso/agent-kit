import type { CAC } from 'cac';
import type { SecretManagerName, SecretsConfig } from '@webpresso/runtime/env';
import { secretManagerRegistry } from '@webpresso/runtime/env';
type OutputWriter = Pick<NodeJS.WriteStream, 'write'>;
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
    readonly registry?: Pick<typeof secretManagerRegistry, 'get'>;
    readonly stdout?: OutputWriter;
    readonly stderr?: OutputWriter;
}
export declare function runSecretsConfigCommand(action: string | undefined, positional: readonly string[], options?: ConfigCommandOptions, deps?: SecretsConfigCommandDeps): Promise<number>;
export declare function registerConfigCommand(cli: CAC): void;
export {};
//# sourceMappingURL=config.d.ts.map