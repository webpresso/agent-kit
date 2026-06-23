/**
 * Single shared `runCommand` for tool spawns.
 *
 * Replaces near-duplicate implementations that lived in `lint.ts` and
 * `typecheck.ts`. Accepts:
 *
 *   - `timeoutMs` — internal deadline (per-tool default; lint=5min, typecheck=10min).
 *   - `signal`    — propagated from the MCP request's AbortSignal so a
 *                   client-issued `notifications/cancelled` aborts the spawn.
 *   - `cwd`       — explicit working directory; project-root resolution lives
 *                   in `./project-root.ts` to keep this module pure.
 *
 * Both internal-timeout and external-cancel kill paths surface as a
 * non-zero `exitCode` (signal-derived) and a `timedOut`/`aborted` flag in
 * the result, so callers never coerce a kill into success.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { exitCodeFromSignal, forceKillProcessTree, killProcessTree, PROCESS_TREE_FORCE_KILL_GRACE_MS, } from '#shared-utils/process-supervisor.js';
export function isRunFailure(outcome) {
    return outcome.error !== undefined;
}
export function isMissingBinary(failure) {
    return failure.error.code === 'ENOENT';
}
// Mirrors package script execution: project-local binaries (oxfmt, oxlint,
// tsc) are devDependencies resolved via node_modules/.bin, not global installs.
const PATH_SEP = process.platform === 'win32' ? ';' : ':';
function buildEnv(cwd) {
    const localBin = join(cwd, 'node_modules', '.bin');
    return {
        ...process.env,
        PATH: [localBin, process.env.PATH].filter(Boolean).join(PATH_SEP),
    };
}
export function runCommand(cmd, args, options) {
    return new Promise((resolve) => {
        const child = spawn(cmd, [...args], {
            ...(options.cwd ? { cwd: options.cwd, env: buildEnv(options.cwd) } : {}),
            detached: process.platform !== 'win32',
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let aborted = false;
        let terminationRequested = false;
        let escalationTimer;
        const requestTermination = () => {
            if (terminationRequested)
                return;
            terminationRequested = true;
            killProcessTree(child, 'SIGTERM');
            if (process.platform === 'win32')
                return;
            escalationTimer = setTimeout(() => {
                forceKillProcessTree(child);
            }, PROCESS_TREE_FORCE_KILL_GRACE_MS);
        };
        const internalTimer = setTimeout(() => {
            timedOut = true;
            requestTermination();
        }, options.timeoutMs);
        const onAbort = () => {
            aborted = true;
            requestTermination();
        };
        if (options.signal) {
            if (options.signal.aborted) {
                // Defer to a microtask so the child's `close` handler (registered
                // below) is in place by the time `kill` fires close. Otherwise an
                // already-aborted signal kills the child before close is wired up
                // and the promise never resolves.
                queueMicrotask(onAbort);
            }
            else {
                options.signal.addEventListener('abort', onAbort, { once: true });
            }
        }
        const cleanup = () => {
            clearTimeout(internalTimer);
            if (escalationTimer)
                clearTimeout(escalationTimer);
            options.signal?.removeEventListener('abort', onAbort);
        };
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });
        child.on('error', (err) => {
            cleanup();
            resolve({ error: err });
        });
        child.on('close', (code, signal) => {
            if (terminationRequested && signal !== 'SIGKILL')
                forceKillProcessTree(child);
            cleanup();
            const exitCode = code ?? exitCodeFromSignal(signal);
            resolve({ stdout, stderr, exitCode, signal, timedOut, aborted });
        });
    });
}
//# sourceMappingURL=run-command.js.map