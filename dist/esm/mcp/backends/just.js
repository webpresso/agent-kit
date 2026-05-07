import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    const args = ['test'];
    if (input.packages && input.packages.length > 0) {
        args.push('--package', ...input.packages);
    }
    else if (input.files && input.files.length > 0) {
        args.push('--file', ...input.files);
    }
    const extraArgs = input.extraArgs ?? inferExtraArgs(cwd, input);
    if (extraArgs.length > 0) {
        args.push('--', ...extraArgs);
    }
    return runCommand('just', args, cwd);
}
function inferExtraArgs(cwd, input) {
    if (input.packages?.some((pkg) => usesVitest(cwd, pkg)) ||
        (!input.packages?.length && usesVitest(cwd))) {
        return ['--reporter=json', '--no-color'];
    }
    return [];
}
function usesVitest(cwd, packageName) {
    const packageJson = findPackageJson(cwd, packageName);
    if (!packageJson)
        return false;
    const pkg = readPackage(packageJson);
    const sections = ['dependencies', 'devDependencies', 'optionalDependencies'];
    return sections.some((section) => {
        const deps = pkg[section];
        return Boolean(deps && typeof deps === 'object' && !Array.isArray(deps) && 'vitest' in deps);
    });
}
function findPackageJson(cwd, packageName) {
    const candidates = packageName
        ? [
            join(cwd, 'packages', packageName, 'package.json'),
            join(cwd, 'apps', packageName, 'package.json'),
            join(cwd, packageName, 'package.json'),
            join(cwd, 'package.json'),
        ]
        : [join(cwd, 'package.json')];
    return candidates.find((candidate) => existsSync(candidate));
}
function readPackage(file) {
    try {
        const value = JSON.parse(readFileSync(file, 'utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return {};
        return value;
    }
    catch {
        return {};
    }
}
function runCommand(cmd, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, [...args], cwd ? { cwd } : {});
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