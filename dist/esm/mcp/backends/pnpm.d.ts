import type { TestResult, TestRunInput } from './just.js';
export type { TestResult, TestRunInput } from './just.js';
/**
 * Run tests via `pnpm`.
 *
 * Argv shape:
 *   - `pnpm -F <p> test` once per package when packages are given (results
 *     aggregated; first non-zero exit wins).
 *   - `pnpm test -- <file1> <file2>` when files are given (no packages).
 *   - `pnpm test` otherwise.
 */
export declare function runTests(input: TestRunInput): Promise<TestResult>;
//# sourceMappingURL=pnpm.d.ts.map