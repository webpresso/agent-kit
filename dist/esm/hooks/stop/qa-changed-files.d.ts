#!/usr/bin/env bun
import { SessionMemorySessionStore } from '#session-memory/session.js';
type EnvLike = Record<string, string | undefined>;
export type StopHookOutput = Record<string, never>;
export interface StopCaptureDeps {
    readonly createStore?: (dbPath: string) => Pick<SessionMemorySessionStore, 'captureEvent' | 'close'>;
    readonly dbPath?: string;
    readonly getChangedFiles?: (projectDir: string) => string[];
    readonly now?: () => Date;
    readonly repoHash?: (projectDir: string) => string;
    readonly runQaChecks?: (qaFiles: string[], projectDir: string) => string[];
}
export declare function getChangedFiles(projectDir: string): string[];
export declare function filterQaFiles(files: string[]): string[];
export declare function getTypecheckFiles(files: string[]): string[];
export declare function findTestFiles(sourceFile: string, projectDir: string): string[];
export declare function discoverTestFiles(changedFiles: string[], projectDir: string): string[];
export declare function buildTypecheckCommand(files: string[]): string | null;
export declare function buildTestCommand(files: string[]): string | null;
export declare function runQaChecks(qaFiles: string[], projectDir: string): string[];
export type StopHookResult = {
    systemMessage: string;
};
export declare function formatStopHookOutput(result: StopHookResult): string;
export declare function resolveSessionMemoryDbPath(projectDir: string, env?: EnvLike): string;
export declare function buildStopTurnSummary(changedFiles: string[], env?: EnvLike, assistantMessage?: string): {
    content: string;
    summary: string;
    changedFiles: string[];
    omittedFileCount: number;
    truncated: boolean;
};
export declare function captureStopTurnSummary(inputValue: unknown, cwd: string, env?: EnvLike, deps?: StopCaptureDeps): boolean;
export declare function processStopHookInput(inputValue: unknown, cwd: string, env?: EnvLike, deps?: StopCaptureDeps): StopHookOutput;
export declare const buildStopHookOutput: typeof processStopHookInput;
export declare function formatStopHookJsonOutput(output: StopHookOutput): string;
export declare function main(): Promise<void>;
export {};
//# sourceMappingURL=qa-changed-files.d.ts.map