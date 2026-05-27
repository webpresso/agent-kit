export interface TestRunInput {
    /** Working tree to run from. Defaults to `CLAUDE_PROJECT_DIR` or `process.cwd()`. */
    readonly cwd?: string;
    readonly packages?: readonly string[];
    readonly files?: readonly string[];
    readonly extraArgs?: readonly string[];
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
}
export interface TestResult {
    readonly passed: boolean;
    readonly output: string;
    readonly exitCode: number;
    readonly timedOut?: boolean;
    readonly aborted?: boolean;
}
/**
 * Run tests via the `vp` facade over the repo-declared package-manager substrate.
 *
 * Argv shape:
 *   - `vp run --filter <p> test` once per package when packages are given (results
 *     aggregated; first non-zero exit wins).
 *   - `vp run test -- <file1> <file2>` when files are given (no packages).
 *   - `vp run test` otherwise.
 */
export declare function runTests(input: TestRunInput): Promise<TestResult>;
//# sourceMappingURL=test.d.ts.map