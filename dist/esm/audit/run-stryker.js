import { spawn } from "node:child_process";
/**
 * Run `stryker run` in the given directory and return its exit code.
 * Injectable spawn for testability.
 */
export async function runStryker(cwd, deps = {}) {
    const spawnFn = deps.spawn ?? spawn;
    return new Promise((resolve) => {
        const child = spawnFn("vp", ["dlx", "stryker", "run"], {
            cwd,
            stdio: "inherit",
            shell: false,
        });
        child.on("error", (error) => {
            const reason = error instanceof Error ? error.message : String(error);
            console.error(`Failed to spawn stryker: ${reason}`);
            resolve(1);
        });
        child.on("exit", (code) => {
            resolve(code ?? 1);
        });
    });
}
//# sourceMappingURL=run-stryker.js.map