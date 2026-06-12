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
export function isRunFailure(outcome) {
    return outcome.error !== undefined;
}
export function isMissingBinary(failure) {
    return failure.error.code === 'ENOENT';
}
const COMMON_SIGNAL_NUMBERS = {
    SIGINT: 2,
    SIGKILL: 9,
    SIGTERM: 15,
};
function exitCodeFromSignal(signal) {
    if (!signal)
        return 1;
    return 128 + (COMMON_SIGNAL_NUMBERS[signal] ?? 15);
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
        const internalTimer = setTimeout(() => {
            timedOut = true;
            killChildTree(child, 'SIGTERM');
        }, options.timeoutMs);
        const onAbort = () => {
            aborted = true;
            killChildTree(child, 'SIGTERM');
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
            if (timedOut || aborted) {
                forceKillChildTree(child);
            }
            cleanup();
            const exitCode = code ?? exitCodeFromSignal(signal);
            resolve({ stdout, stderr, exitCode, signal, timedOut, aborted });
        });
    });
}
function killChildTree(child, signal) {
    if (process.platform !== 'win32' && child.pid) {
        try {
            process.kill(-child.pid, signal);
            return;
        }
        catch {
            // Fall back to the direct child below. The process may have exited between
            // timeout/abort and signal delivery, or the host may reject group kills.
        }
    }
    child.kill(signal);
}
function forceKillChildTree(child) {
    if (process.platform === 'win32' || !child.pid)
        return;
    try {
        process.kill(-child.pid, 'SIGKILL');
    }
    catch {
        // Best-effort cleanup only; the group may already be gone.
    }
}
//# sourceMappingURL=run-command.js.map