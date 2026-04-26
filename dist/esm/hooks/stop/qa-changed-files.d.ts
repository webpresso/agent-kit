#!/usr/bin/env node
export declare function getChangedFiles(projectDir: string): string[];
export declare function filterQaFiles(files: string[]): string[];
export declare function getTypecheckFiles(files: string[]): string[];
export declare function findTestFiles(sourceFile: string, projectDir: string): string[];
export declare function discoverTestFiles(changedFiles: string[], projectDir: string): string[];
export declare function buildTypecheckCommand(files: string[]): string | null;
export declare function buildTestCommand(files: string[]): string | null;
export declare function runQaChecks(qaFiles: string[], projectDir: string): string[];
//# sourceMappingURL=qa-changed-files.d.ts.map