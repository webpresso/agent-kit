import { spawnSync } from 'node:child_process';
import type { SecretsConfig } from './secrets-config.js';
export interface FetchSecretsOptions {
    readonly cwd?: string;
    readonly environment?: string;
}
/**
 * Formats a failed secret-manager CLI invocation without exposing secret output.
 *
 * @remarks CLI stdout is deliberately excluded because secret managers may write
 * partial secret payloads to stdout before exiting with a failure.
 * @remarks Only the first stderr line is used; that line is redacted with
 * `redactText` before being truncated to `ERROR_DETAIL_MAX_BYTES` bytes so a
 * token crossing the byte boundary cannot leave an unredacted prefix behind.
 * @remarks The command string is preserved for diagnosability. Project IDs and
 * environment selectors are deployment topology, not secret material.
 */
export declare function formatFailure(provider: string, command: string, result: ReturnType<typeof spawnSync>): never;
export declare function parseJsonSecrets(provider: string, text: string): Record<string, string>;
export declare function fetchSecretsForConfig(config: SecretsConfig, options?: FetchSecretsOptions): Record<string, string>;
//# sourceMappingURL=secret-managers.d.ts.map