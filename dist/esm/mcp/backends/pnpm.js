import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Run tests via `pnpm`.
 *
 * Argv shape:
 *   - `pnpm -F <p> test` once per package when packages are given (results
 *     aggregated; first non-zero exit wins).
 *   - `pnpm test -- <file1> <file2>` when files are given (no packages).
 *   - `pnpm test` otherwise.
 */
export async function runTests(input) {
    const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    if (input.packages && input.packages.length > 0) {
        let combinedOutput = '';
        let firstFailure = 0;
        for (const pkg of input.packages) {
            const result = await runPackageScopedTests(cwd, pkg, input.files);
            combinedOutput += result.output;
            if (!result.passed && firstFailure === 0)
                firstFailure = result.exitCode;
        }
        return {
            passed: firstFailure === 0,
            output: combinedOutput,
            exitCode: firstFailure,
        };
    }
    if (input.files && input.files.length > 0) {
        if (usesVitest(cwd)) {
            return runCommand('pnpm', ['exec', 'vitest', 'run', '--reporter=json', '--no-color', ...input.files], cwd);
        }
        return runCommand('pnpm', ['test', '--', ...input.files], cwd);
    }
    if (usesVitest(cwd)) {
        return runCommand('pnpm', ['exec', 'vitest', 'run', '--reporter=json', '--no-color'], cwd);
    }
    return runCommand('pnpm', ['test'], cwd);
}
function runPackageScopedTests(cwd, packageName, files) {
    if (usesVitest(cwd, packageName)) {
        return runCommand('pnpm', [
            '-F',
            packageName,
            'exec',
            'vitest',
            'run',
            '--reporter=json',
            '--no-color',
            ...(files ?? []),
        ], cwd);
    }
    if (files && files.length > 0) {
        return runCommand('pnpm', ['-F', packageName, 'test', '--', ...files], cwd);
    }
    return runCommand('pnpm', ['-F', packageName, 'test'], cwd);
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
//# sourceMappingURL=pnpm.js.map