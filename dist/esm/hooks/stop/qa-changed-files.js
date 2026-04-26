#!/usr/bin/env node
import { globSync } from 'glob';
import { execSync } from 'node:child_process';
import { basename, dirname, extname, join } from 'node:path';
import { isLintableFile, isSkippedPath } from '../post-tool/lint-after-edit.js';
const TYPECHECKABLE_EXTENSIONS = new Set(['.ts', '.tsx']);
export function getChangedFiles(projectDir) {
    const unstaged = execSync('git diff --name-only', { cwd: projectDir, encoding: 'utf-8' }).trim();
    const staged = execSync('git diff --cached --name-only', { cwd: projectDir, encoding: 'utf-8' }).trim();
    const all = new Set();
    for (const line of unstaged.split('\n'))
        if (line)
            all.add(line);
    for (const line of staged.split('\n'))
        if (line)
            all.add(line);
    return [...all];
}
export function filterQaFiles(files) {
    return files.filter((f) => isLintableFile(f) && !isSkippedPath(f));
}
export function getTypecheckFiles(files) {
    return files.filter((f) => TYPECHECKABLE_EXTENSIONS.has(extname(f)));
}
export function findTestFiles(sourceFile, projectDir) {
    const ext = extname(sourceFile);
    const base = basename(sourceFile, ext);
    const dir = dirname(sourceFile);
    if (base.endsWith('.test') || base.endsWith('.integration.test'))
        return [sourceFile];
    const pattern = join(dir, `${base}.{test,integration.test}{.ts,.tsx}`);
    return globSync(pattern, { cwd: projectDir });
}
export function discoverTestFiles(changedFiles, projectDir) {
    const testFiles = new Set();
    for (const file of changedFiles) {
        for (const testFile of findTestFiles(file, projectDir))
            testFiles.add(testFile);
    }
    return [...testFiles];
}
export function buildTypecheckCommand(files) {
    if (files.length === 0)
        return null;
    return `just typecheck ${files.map((f) => `--file "${f}"`).join(' ')}`;
}
export function buildTestCommand(files) {
    if (files.length === 0)
        return null;
    return `just test ${files.map((f) => `--file "${f}"`).join(' ')}`;
}
function runCommand(cmd, projectDir) {
    try {
        execSync(cmd, { cwd: projectDir, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
        return { success: true, stderr: '' };
    }
    catch (error) {
        return { success: false, stderr: error.stderr || String(error) };
    }
}
function runStep(label, cmd, projectDir) {
    if (!cmd)
        return null;
    const result = runCommand(cmd, projectDir);
    return result.success ? null : `${label} failed:\n${result.stderr}`;
}
export function runQaChecks(qaFiles, projectDir) {
    const typecheckCmd = buildTypecheckCommand(getTypecheckFiles(qaFiles));
    const testCmd = buildTestCommand(discoverTestFiles(qaFiles, projectDir));
    const errors = [];
    const typecheckErr = runStep('Typecheck', typecheckCmd, projectDir);
    if (typecheckErr)
        errors.push(typecheckErr);
    const testErr = runStep('Tests', testCmd, projectDir);
    if (testErr)
        errors.push(testErr);
    return errors;
}
async function main() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    // consume stdin but don't need content
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const qaFiles = filterQaFiles(getChangedFiles(projectDir));
    if (qaFiles.length === 0)
        process.exit(0);
    const errors = runQaChecks(qaFiles, projectDir);
    if (errors.length > 0) {
        process.stderr.write(errors.join('\n\n'));
        process.exit(2);
    }
    process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
//# sourceMappingURL=qa-changed-files.js.map