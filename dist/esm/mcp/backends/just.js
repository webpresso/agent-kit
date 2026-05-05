import { spawn } from 'node:child_process';
/**
 * Run tests via `just test`.
 *
 * Argv shape:
 *   - `just test --package <p1> <p2> ...` when packages are given.
 *   - `just test --file <f1> <f2> ...` when files are given (and no packages).
 *   - `just test` otherwise.
 *
 * Captures stdout + stderr; resolves with the structured result and the
 * spawned process's exit code.
 */
export async function runTests(input) {
    const args = ['test'];
    if (input.packages && input.packages.length > 0) {
        args.push('--package', ...input.packages);
    }
    else if (input.files && input.files.length > 0) {
        args.push('--file', ...input.files);
    }
    return runCommand('just', args);
}
function runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, [...args]);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });
        child.on('error', (err) => reject(err));
        child.on('close', (code) => {
            const exitCode = code ?? 0;
            resolve({
                passed: exitCode === 0,
                output: [stdout, stderr].filter(Boolean).join(''),
                exitCode,
            });
        });
    });
}
//# sourceMappingURL=just.js.map