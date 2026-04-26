export interface TestRunInput {
    readonly packages?: readonly string[];
    readonly files?: readonly string[];
}
export interface TestResult {
    readonly passed: boolean;
    readonly output: string;
    readonly exitCode: number;
}
/**
 * Run tests via `just test`.
 *
 * Argv shape:
 *   - `just test --package <p1> <p2> ...` when packages are given.
 *   - `just test --file <f1> <f2> ...` when files are given (and no packages).
 *   - `just test` otherwise.
 *
 * Captures stdout + stderr; resolves with the structured result and the
 * spawned process's exit code.
 */
export declare function runTests(input: TestRunInput): Promise<TestResult>;
//# sourceMappingURL=just.d.ts.map