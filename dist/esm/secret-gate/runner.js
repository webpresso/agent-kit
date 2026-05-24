import { spawn } from 'node:child_process';
const SIGNAL_TO_EXIT_CODE = {
    SIGINT: 2,
    SIGKILL: 9,
    SIGTERM: 15,
};
export function buildSecretGateCommand(options) {
    const runner = (options.runner ?? 'with-secrets').trim();
    const envProfile = (options.envProfile ?? 'secrets-only').trim();
    const args = [
        '--env-profile',
        envProfile,
        '--',
        options.command,
        ...(options.args ?? []),
    ];
    return { command: runner, args };
}
function exitCodeFromSignal(signal) {
    if (!signal)
        return 1;
    return 128 + (SIGNAL_TO_EXIT_CODE[signal] ?? 15);
}
export function runSecretGateCommand(options) {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const command = buildSecretGateCommand(options);
    return new Promise((resolve) => {
        const child = spawn(command.command, [...command.args], {
            cwd: options.cwd,
            env: process.env,
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let aborted = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
        }, timeoutMs);
        const onAbort = () => {
            aborted = true;
            child.kill('SIGTERM');
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
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
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
//# sourceMappingURL=runner.js.map