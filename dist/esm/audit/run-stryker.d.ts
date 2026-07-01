import { spawn } from "node:child_process";
/**
 * Run `stryker run` in the given directory and return its exit code.
 * Injectable spawn for testability.
 */
export declare function runStryker(cwd: string, deps?: {
    spawn?: typeof spawn;
}): Promise<number>;
//# sourceMappingURL=run-stryker.d.ts.map