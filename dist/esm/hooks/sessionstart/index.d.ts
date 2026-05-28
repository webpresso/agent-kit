#!/usr/bin/env bun
import { WP_ROUTING_BLOCK } from '#hooks/shared/routing-block';
export { WP_ROUTING_BLOCK };
export declare const MAX_BYTES: number;
export declare const TRUNCATION_NOTICE = "\n\n[truncated: file exceeded 200KB limit]";
type StartInput = Record<string, unknown>;
type EnvLike = Record<string, string | undefined>;
/**
 * Pure function: given a parsed input payload, a working directory, and
 * environment variables, produce the JSON string that the hook should write
 * to stdout. Always emits — never returns null. WP_ROUTING_BLOCK is always
 * prepended; `.agent/routing.md` content is appended when present and non-empty.
 */
export declare function buildOutput(_input: StartInput, cwd: string, env: EnvLike): string;
export declare function main(): Promise<void>;
//# sourceMappingURL=index.d.ts.map