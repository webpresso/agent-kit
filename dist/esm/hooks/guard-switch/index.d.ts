#!/usr/bin/env bun
import { SessionMemorySessionStore } from "#session-memory/session.js";
type EnvLike = Record<string, string | undefined>;
export type GuardSwitchResult = Record<string, never> | {
    readonly decision: "block";
    readonly reason: string;
};
export interface GuardSwitchDeps {
    readonly createStore?: (dbPath: string) => Pick<SessionMemorySessionStore, "captureEvent" | "close">;
    readonly dbPath?: string;
    readonly now?: () => Date;
    readonly repoHash?: (projectDir: string) => string;
    readonly setGuardEnabled?: (enabled: boolean) => void;
}
export declare const DEFAULT_MAX_PROMPT_CAPTURE_BYTES = 2048;
export declare function resolveSessionMemoryDbPath(projectDir: string, env?: EnvLike): string;
export declare function processGuardSwitchInput(inputValue: unknown, cwd: string, env?: EnvLike, deps?: GuardSwitchDeps): GuardSwitchResult;
export declare function main(): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map