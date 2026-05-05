/**
 * Minimal shell-command helper for audit scripts.
 *
 * Minimal inline replacement for the vendored process-utils runSystemCommand
 * helper. Covers the single
 * use case the audit scripts need: spawn a command, capture stdout/stderr,
 * return an exit code.
 */
import { spawn } from 'node:child_process';
export function runShell(options) {
    return new Promise((resolve) => {
        const child = spawn(options.command, options.args, {
            cwd: options.cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString('utf-8');
        });
        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString('utf-8');
        });
        child.on('close', (code) => {
            resolve({ stdout, stderr, exitCode: code ?? 0 });
        });
    });
}
//# sourceMappingURL=shell.js.map