#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { runHook } from '#hooks/shared/hook-bootstrap';
import { getFilePath } from '#hooks/shared/types';
import { isDirectEntrypoint } from '#hooks/shared/direct-entrypoint';
export const LINTABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css'];
export const SKIP_PATTERNS = [
    /\/node_modules\//,
    /\/dist\//,
    /\/.next\//,
    /\/generated\//,
    /\/worker-configuration\.d\.ts$/,
];
export function isLintableFile(filePath) {
    return LINTABLE_EXTENSIONS.includes(extname(filePath));
}
export function isSkippedPath(filePath) {
    return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}
export function shouldLintFile(input) {
    const filePath = getFilePath(input);
    if (!filePath)
        return false;
    if (!isLintableFile(filePath))
        return false;
    if (isSkippedPath(filePath))
        return false;
    return true;
}
/**
 * Hot-path compatibility shim.
 *
 * `PostToolUse` fires for every eligible edit/write, so broad shell-outs here
 * add latency on the critical path. Until the deferred execution plane exists,
 * the hook only classifies that a file would have been lint-eligible.
 */
export function lintFile(filePath, _projectDir) {
    if (!existsSync(filePath))
        return false;
    return true;
}
export function processPostToolUse(input, projectDir) {
    if (!shouldLintFile(input))
        return false;
    const filePath = input.tool_input.file_path;
    return lintFile(filePath, projectDir);
}
export async function main() {
    await runHook((input) => {
        const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        processPostToolUse(input, projectDir);
        return null;
    }, () => '{}');
}
if (isDirectEntrypoint(import.meta.url)) {
    void main();
}
//# sourceMappingURL=lint-after-edit.js.map