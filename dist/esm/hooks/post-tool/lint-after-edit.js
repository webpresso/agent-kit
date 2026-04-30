#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStdinJson, suppressStderr } from '#hooks/shared/hook-bootstrap';
import { getFilePath } from '#hooks/shared/types';
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
export function lintFile(filePath, projectDir) {
    if (!existsSync(filePath))
        return false;
    try {
        execSync(`just lint --file "${filePath}"`, { cwd: projectDir, stdio: 'ignore' });
    }
    catch {
        // Non-blocking
    }
    return true;
}
export function processPostToolUse(input, projectDir) {
    if (!shouldLintFile(input))
        return false;
    const filePath = input.tool_input.file_path;
    return lintFile(filePath, projectDir);
}
async function main() {
    suppressStderr();
    const inputJson = await readStdinJson();
    if (!inputJson.trim())
        process.exit(0);
    const input = JSON.parse(inputJson);
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    processPostToolUse(input, projectDir);
    process.exit(0);
}
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
    main();
}
//# sourceMappingURL=lint-after-edit.js.map