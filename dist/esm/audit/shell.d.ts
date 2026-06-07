import type { ChildProcess } from 'node:child_process';
export interface RunShellOptions {
    command: string;
    args: string[];
    cwd?: string;
}
export interface RunShellResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export type SpawnFn = (command: string, args: string[], options: {
    cwd?: string;
    stdio: ['ignore', 'pipe', 'pipe'];
}) => ChildProcess;
export declare function runShell(options: RunShellOptions, spawn?: SpawnFn): Promise<RunShellResult>;
//# sourceMappingURL=shell.d.ts.map