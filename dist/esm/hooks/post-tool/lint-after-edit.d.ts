#!/usr/bin/env bun
import type { ToolInput } from '#hooks/shared/types';
import { SessionMemorySessionStore } from '#session-memory/session.js';
export declare const LINTABLE_EXTENSIONS: readonly [".ts", ".tsx", ".js", ".jsx", ".json", ".css"];
export declare const DEFAULT_MAX_CAPTURE_BYTES = 2048;
type EnvLike = Record<string, string | undefined>;
export interface PostToolCaptureDeps {
    readonly createStore?: (dbPath: string) => Pick<SessionMemorySessionStore, 'captureEvent' | 'close'>;
    readonly dbPath?: string;
    readonly now?: () => Date;
    readonly repoHash?: (projectDir: string) => string;
}
export declare const SKIP_PATTERNS: readonly RegExp[];
export declare function isLintableFile(filePath: string): boolean;
export declare function isSkippedPath(filePath: string): boolean;
export declare function shouldLintFile(input: ToolInput): boolean;
/**
 * Hot-path stub.
 *
 * `PostToolUse` fires for every eligible edit/write, so broad shell-outs here
 * add latency on the critical path. Until the deferred execution plane exists,
 * the hook only classifies that a file would have been lint-eligible.
 */
export declare function lintFile(filePath: string, _projectDir: string): boolean;
export declare function resolveSessionMemoryDbPath(projectDir: string, env?: EnvLike): string;
export declare function capturePostToolUse(input: ToolInput, projectDir: string, env?: EnvLike, deps?: PostToolCaptureDeps): boolean;
export declare function processPostToolUse(input: ToolInput, projectDir: string, env?: EnvLike, deps?: PostToolCaptureDeps): boolean;
export declare function main(): Promise<void>;
export {};
//# sourceMappingURL=lint-after-edit.d.ts.map