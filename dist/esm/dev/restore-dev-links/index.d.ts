#!/usr/bin/env bun
export type RestoreOutcome = {
    kind: 'no-state-file';
} | {
    kind: 'invalid-state-file';
    reason: string;
} | {
    kind: 'source-missing';
    expectedSource: string;
} | {
    kind: 'already-linked';
    target: string;
    source: string;
} | {
    kind: 'relinked';
    target: string;
    source: string;
    previous: string | null;
};
export interface RestoreOptions {
    cwd?: string;
    stdout?: Pick<typeof process.stdout, 'write'>;
    stderr?: Pick<typeof process.stderr, 'write'>;
}
export interface RestoreResult {
    exitCode: number;
    outcomes: RestoreOutcome[];
}
export declare function restoreDevLinks(options?: RestoreOptions): RestoreResult;
//# sourceMappingURL=index.d.ts.map