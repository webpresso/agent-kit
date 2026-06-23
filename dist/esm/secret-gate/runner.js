import { spawn } from 'node:child_process';
import { buildRuntimeProcessEnv } from '#runtime/index.js';
import { exitCodeFromSignal, forceKillProcessTree, killProcessTree, } from '#shared-utils/process-supervisor.js';
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
export const SECRET_GATE_FORCE_KILL_GRACE_MS = 5_000;
const SECRET_GATE_RUNTIME_PROFILES = [
    'none',
    'public',
    'secrets-only',
    'service-runtime',
    'database',
    'full',
];
const DIRECT_ENV_PROFILES = new Set(['none', 'public']);
export function isSecretGateRuntimeProfile(value) {
    return SECRET_GATE_RUNTIME_PROFILES.includes(value);
}
export function buildSecretGateCommand(options) {
    const envProfile = options.envProfile?.trim();
    if (envProfile && !isSecretGateRuntimeProfile(envProfile)) {
        throw new Error(`Unsupported secret-gate envProfile "${envProfile}". Use one of: ${SECRET_GATE_RUNTIME_PROFILES.join(', ')}. Pass provider-specific Doppler/Infisical selectors via secretEnvProfile.`);
    }
    if (!options.forceSecretGate && envProfile && DIRECT_ENV_PROFILES.has(envProfile)) {
        return { command: options.command, args: [...(options.args ?? [])] };
    }
    const sink = options.sink?.trim();
    if (!sink) {
        throw new Error('Secret-gate sink is required when secret resolution is enabled.');
    }
    const profile = options.profile?.trim() || options.secretEnvProfile?.trim() || 'preview';
    const args = [
        'secrets',
        'run',
        '--sink',
        sink,
        '--profile',
        profile,
        '--',
        options.command,
        ...(options.args ?? []),
    ];
    return { command: 'wp', args };
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
            }, SECRET_GATE_FORCE_KILL_GRACE_MS);
        };
        const timer = setTimeout(() => {
            timedOut = true;
            requestTermination();
        }, timeoutMs);
        const onAbort = () => {
            aborted = true;
            requestTermination();
        };
        if (options.signal) {
            if (options.signal.aborted)
                queueMicrotask(onAbort);
            else
                options.signal.addEventListener('abort', onAbort, { once: true });
        }
        const cleanup = () => {
            clearTimeout(timer);
            if (escalationTimer)
                clearTimeout(escalationTimer);
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