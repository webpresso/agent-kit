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
export declare function runShell(options: RunShellOptions): Promise<RunShellResult>;
//# sourceMappingURL=shell.d.ts.map