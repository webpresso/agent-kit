import type { SecretsConfig } from './secrets-config.js';
export interface FetchSecretsOptions {
    readonly cwd?: string;
    readonly environment?: string;
}
export declare function fetchSecretsForConfig(config: SecretsConfig, options?: FetchSecretsOptions): Record<string, string>;
//# sourceMappingURL=secret-managers.d.ts.map