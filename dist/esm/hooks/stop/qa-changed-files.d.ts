#!/usr/bin/env bun
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
export declare function main(): Promise<void>;
//# sourceMappingURL=qa-changed-files.d.ts.map