#!/usr/bin/env bun
import { Database } from "#db/sqlite.js";
export declare const MAX_BYTES: number;
export declare const TRUNCATION_NOTICE = "\n\n[truncated: file exceeded 200KB limit]";
export declare const RESUME_MAX_EVENT_BYTES: number;
export declare const RESUME_MAX_BYTES: number;
export declare const RESUME_CAP_MS = 750;
export declare const RESUME_MIN_PRIORITY = 50;
type StartInput = Record<string, unknown>;
type EnvLike = Record<string, string | undefined>;
export interface SessionStartDeps {
    readonly createDatabase?: (dbPath: string) => Pick<Database, "prepare" | "close">;
    readonly dbPath?: string;
    readonly repoHash?: (projectDir: string) => string;
}
export declare function resolveSessionMemoryDbPath(projectDir: string, env: EnvLike): string;
/**
 * Pure function: given a parsed input payload, a working directory, and
 * environment variables, produce the JSON string that the hook should write
 * to stdout. Always emits valid JSON — never returns null. The
 * `additionalContext` is assembled from `.agent/routing.md` (when present and
 * non-empty), session-memory continuity, and the update banner; it is empty
 * when none of those are available.
 */
export declare function buildOutput(input: StartInput, cwd: string, env: EnvLike, deps?: SessionStartDeps): string;
export declare function main(): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map