import type { TestResult, TestRunInput } from './just.js';
export type { TestResult, TestRunInput } from './just.js';
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
//# sourceMappingURL=pnpm.d.ts.map