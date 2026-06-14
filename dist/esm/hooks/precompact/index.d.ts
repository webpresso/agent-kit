#!/usr/bin/env bun
import { SessionMemorySessionStore } from '#session-memory/session.js';
type EnvLike = Record<string, string | undefined>;
export type PreCompactHookOutput = Record<string, never>;
export interface PreCompactDeps {
    readonly createStore?: (dbPath: string) => Pick<SessionMemorySessionStore, 'captureEvent' | 'snapshot' | 'close'>;
    readonly dbPath?: string;
    readonly now?: () => Date;
    readonly repoHash?: (projectDir: string) => string;
}
export declare const DEFAULT_MAX_SNAPSHOT_BYTES: number;
export declare const DEFAULT_MAX_EVENT_BYTES: number;
export declare const DEFAULT_CAP_MS = 150;
export declare const DEFAULT_MIN_PRIORITY = 50;
export declare function resolveSessionMemoryDbPath(projectDir: string, env: EnvLike): string;
export declare function formatPreCompactOutput(output: PreCompactHookOutput): string;
export declare function buildOutput(inputValue: unknown, cwd: string, env: EnvLike, deps?: PreCompactDeps): PreCompactHookOutput;
export declare function main(): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map