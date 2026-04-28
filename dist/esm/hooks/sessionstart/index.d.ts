#!/usr/bin/env node
export declare const MAX_BYTES: number;
export declare const TRUNCATION_NOTICE = "\n\n[truncated: file exceeded 200KB limit]";
type StartInput = Record<string, unknown>;
type EnvLike = Record<string, string | undefined>;
/**
 * Pure function: given a parsed input payload, a working directory, and
 * environment variables, produce the JSON string that the hook should write
 * to stdout — or `null` to indicate "exit silently with no output".
 */
export declare function buildOutput(_input: StartInput, cwd: string, env: EnvLike): string | null;
export declare function main(): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map