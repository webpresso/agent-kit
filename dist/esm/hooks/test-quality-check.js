#!/usr/bin/env bun
import { resolveActiveWorktreeRoot } from "./shared/worktree-root.js";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { isDirectEntrypoint } from "#hooks/shared/direct-entrypoint";
import { findMutationGamingPatterns, findTautologicalAssertions, MUTATION_GAMING_PATTERNS, TAUTOLOGICAL_PATTERNS, } from "./pretool-guard/validators/test-quality.js";
const testFileRegex = /\.test\.(ts|tsx|js|jsx)$/;
export function getTestQualityCheckCwd() {
    return resolveActiveWorktreeRoot(process.cwd());
}
export function resolveTestFilePath(filePath, cwd = getTestQualityCheckCwd()) {
    return isAbsolute(filePath) ? filePath : join(cwd, filePath);
}
export function runTestQualityCheck(argv = process.argv.slice(2), cwd = getTestQualityCheckCwd()) {
    const testFiles = argv.filter((filePath) => testFileRegex.test(filePath));
    if (testFiles.length === 0)
        return;
    let hasFailures = false;
    const failureLines = [];
    for (const filePath of testFiles) {
        if (filePath.includes("test-quality.test.ts"))
            continue;
        try {
            const resolvedPath = resolveTestFilePath(filePath, cwd);
            const content = readFileSync(resolvedPath, "utf8");
            const gamingMatches = findMutationGamingPatterns(content, filePath);
            if (gamingMatches.length > 0) {
                hasFailures = true;
                failureLines.push(`❌ ${filePath}`);
                for (const match of gamingMatches) {
                    failureLines.push(match.line === 0
                        ? `  File path: ${match.pattern}`
                        : `  Line ${match.line}: ${match.pattern}`);
                }
            }
            const matches = findTautologicalAssertions(content);
            if (matches.length > 0) {
                hasFailures = true;
                failureLines.push(`❌ ${filePath}`);
                for (const match of matches)
                    failureLines.push(`  Line ${match.line}: ${match.pattern}`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to read ${filePath}: ${message}`);
            throw error;
        }
    }
    if (hasFailures) {
        console.error(`Test quality issues detected (${MUTATION_GAMING_PATTERNS.length} gaming patterns + ${TAUTOLOGICAL_PATTERNS.length} tautology patterns checked):`);
        for (const line of failureLines)
            console.error(line);
        process.exit(1);
    }
}
if (isDirectEntrypoint(import.meta.url)) {
    runTestQualityCheck();
}
//# sourceMappingURL=test-quality-check.js.map