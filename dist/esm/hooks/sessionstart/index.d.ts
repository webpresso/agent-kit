#!/usr/bin/env bun
import { WP_ROUTING_BLOCK } from '#hooks/shared/routing-block';
import { Database } from '#db/sqlite.js';
export { WP_ROUTING_BLOCK };
export declare const MAX_BYTES: number;
export declare const TRUNCATION_NOTICE = "\n\n[truncated: file exceeded 200KB limit]";
export declare const RESUME_MAX_EVENT_BYTES: number;
export declare const RESUME_MAX_BYTES: number;
export declare const RESUME_CAP_MS = 750;
export declare const RESUME_MIN_PRIORITY = 50;
type StartInput = Record<string, unknown>;
type EnvLike = Record<string, string | undefined>;
export interface SessionStartDeps {
    readonly createDatabase?: (dbPath: string) => Pick<Database, 'prepare' | 'close'>;
    readonly dbPath?: string;
    readonly repoHash?: (projectDir: string) => string;
}
export declare function resolveSessionMemoryDbPath(projectDir: string, env: EnvLike): string;
/**
 * Pure function: given a parsed input payload, a working directory, and
 * environment variables, produce the JSON string that the hook should write
 * to stdout. Always emits — never returns null. WP_ROUTING_BLOCK is always
 * prepended; `.agent/routing.md` content is appended when present and non-empty.
 */
export declare function buildOutput(input: StartInput, cwd: string, env: EnvLike, deps?: SessionStartDeps): string;
export declare function main(): Promise<void>;
//# sourceMappingURL=index.d.ts.map