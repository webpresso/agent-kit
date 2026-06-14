import { spawn } from 'node:child_process';
import { buildRuntimeProcessEnv } from '#runtime/index.js';
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const SIGNAL_TO_EXIT_CODE = {
    SIGINT: 2,
    SIGKILL: 9,
    SIGTERM: 15,
};
const DIRECT_ENV_PROFILES = new Set(['none', 'public']);
export function buildSecretGateCommand(options) {
    const runner = options.runner?.trim() || 'with-secrets';
    const envProfile = options.envProfile?.trim();
    if (runner === 'with-secrets' && envProfile && DIRECT_ENV_PROFILES.has(envProfile)) {
        return { command: options.command, args: [...(options.args ?? [])] };
    }
    const args = envProfile
        ? ['--env-profile', envProfile, '--', options.command, ...(options.args ?? [])]
        : ['--', options.command, ...(options.args ?? [])];
    return { command: runner, args };
}
function exitCodeFromSignal(signal) {
    if (!signal)
        return 1;
    return 128 + (SIGNAL_TO_EXIT_CODE[signal] ?? 15);
}
export function runSecretGateCommand(options) {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const command = buildSecretGateCommand(options);
    return new Promise((resolve) => {
        const child = spawn(command.command, [...command.args], {
            cwd: options.cwd,
            env: buildRuntimeProcessEnv(options.cwd, process.env),
            detached: process.platform !== 'win32',
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let aborted = false;
        const timer = setTimeout(() => {
            timedOut = true;
            killProcessTree(child.pid, child.kill.bind(child), 'SIGTERM');
        }, timeoutMs);
        const onAbort = () => {
            aborted = true;
            killProcessTree(child.pid, child.kill.bind(child), 'SIGTERM');
        };
        if (options.signal) {
            if (options.signal.aborted)
                queueMicrotask(onAbort);
            else
                options.signal.addEventListener('abort', onAbort, { once: true });
        }
        const cleanup = () => {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
        };
        child.stdout.on('data', (chunk) => {
            stdout = appendBoundedOutput(stdout, chunk, maxOutputBytes);
        });
        child.stderr.on('data', (chunk) => {
            stderr = appendBoundedOutput(stderr, chunk, maxOutputBytes);
        });
        child.on('error', (error) => {
            cleanup();
            resolve({
                exitCode: 1,
                stdout,
                stderr: `${stderr}${error.message}`,
                timedOut,
                aborted,
                signal: null,
            });
        });
        child.on('close', (code, signal) => {
            cleanup();
            resolve({
                exitCode: code ?? exitCodeFromSignal(signal),
                stdout,
                stderr,
                timedOut,
                aborted,
                signal,
            });
        });
    });
}
function killProcessTree(pid, fallbackKill, signal) {
    if (pid && process.platform !== 'win32') {
        try {
            process.kill(-pid, signal);
            return;
        }
        catch {
            // Fall through to killing the child when process-group cleanup is not available.
        }
    }
    fallbackKill(signal);
}
function appendBoundedOutput(current, chunk, maxBytes) {
    if (maxBytes <= 0)
        return '';
    const next = current + chunk.toString('utf8');
    if (Buffer.byteLength(next, 'utf8') <= maxBytes)
        return next;
    const marker = '\n[output truncated by secret-gate runner]\n';
    const markerBytes = Buffer.byteLength(marker, 'utf8');
    const budget = Math.max(0, maxBytes - markerBytes);
    return `${next.slice(0, budget)}${marker}`;
}
//# sourceMappingURL=runner.js.map