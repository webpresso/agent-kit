import type { CAC } from 'cac';
import { spawnRuntimeCommandSync } from '#runtime/executor.js';
export interface SecretsCommandOptions {
    readonly cwd?: string;
    readonly profile?: string;
    readonly sink?: string;
    readonly json?: boolean;
    readonly lanes?: readonly string[];
    readonly apply?: boolean;
    readonly argv?: readonly string[];
}
export interface SecretsCommandDeps {
    readonly readConfig?: (cwd?: string) => unknown;
    readonly stdout?: Pick<NodeJS.WriteStream, 'write'>;
    readonly stderr?: Pick<NodeJS.WriteStream, 'write'>;
    readonly runGitHubSecretSet?: (name: string, value: string, cwd?: string) => void;
    readonly runSecretScopedCommand?: typeof spawnRuntimeCommandSync;
    readonly env?: NodeJS.ProcessEnv;
}
interface GitHubSecretSetInvocation {
    readonly command: string;
    readonly args: readonly string[];
    readonly options: {
        readonly cwd: string | undefined;
        readonly input: string;
        readonly stdio: ['pipe', 'ignore', 'ignore'];
    };
}
export declare function registerSecretsCommand(cli: CAC): void;
export declare function runSecretsCommand(action: string, target: string | undefined, options?: SecretsCommandOptions, deps?: SecretsCommandDeps): Promise<number>;
export declare function runSecretsDoctor(options?: SecretsCommandOptions, deps?: SecretsCommandDeps): Promise<number>;
export declare function runSecretsRun(options?: SecretsCommandOptions, deps?: SecretsCommandDeps): number;
export declare function runSecretsBootstrapGithub(options?: SecretsCommandOptions, deps?: SecretsCommandDeps): Promise<number>;
export declare function createGitHubSecretSetInvocation(name: string, value: string, cwd: string | undefined): GitHubSecretSetInvocation;
export {};
//# sourceMappingURL=secrets.d.ts.map