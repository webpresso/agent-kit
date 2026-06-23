import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
// TARGET_FILES is an intentional, hand-maintained policy allowlist. It does NOT
// auto-discover new state-bearing modules (unlike the dir-walking no-math-random.ts).
// When new state-bearing write sites are added, update this list explicitly.
const TARGET_FILES = [
    'src/blueprint/freshness.ts',
    'src/mcp/blueprint-server.ts',
    'src/cli/commands/blueprint/db-commands.ts',
    'src/hooks/guard-switch/state.ts',
    'src/blueprint/utils/decision-trace-artifacts.ts',
    'src/cli/commands/config.ts',
    'src/cli/auto-update/installer.ts',
];
export function auditAtomicStateWrites(rootDirectory = process.cwd()) {
    const violations = [];
    let checked = 0;
    for (const relativeFile of TARGET_FILES) {
        const file = path.join(rootDirectory, relativeFile);
        if (!existsSync(file))
            continue;
        checked += 1;
        // Strip line and block comments before matching to avoid false positives
        // on commented-out calls. Known remaining limitation: a writeFileSync(
        // inside a string literal can still flag (YAGNI — target files don't
        // contain such strings today and a full AST parser is disproportionate).
        const stripped = stripComments(readFileSync(file, 'utf8'));
        if (/\bwriteFileSync\s*\(/u.test(stripped)) {
            violations.push({
                file: relativeFile,
                message: 'state-bearing writes must use writeFileAtomic or writeJsonFile({ atomic: true })',
            });
        }
        for (const call of findCalls(stripped, 'writeJsonFile')) {
            if (!call.includes('atomic: true')) {
                violations.push({
                    file: relativeFile,
                    message: 'state-bearing writeJsonFile calls must pass { atomic: true }',
                });
            }
        }
    }
    return {
        ok: violations.length === 0,
        title: 'Atomic state writes',
        checked,
        violations,
    };
}
function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
}
function findCalls(source, callee) {
    const calls = [];
    const pattern = new RegExp(`\\b${callee}\\s*\\(`, 'gu');
    for (const match of source.matchAll(pattern)) {
        const start = match.index;
        if (start === undefined)
            continue;
        let depth = 0;
        let sawOpenParen = false;
        for (let i = start; i < source.length; i += 1) {
            const char = source[i];
            if (char === '(') {
                sawOpenParen = true;
                depth += 1;
            }
            if (char === ')')
                depth -= 1;
            if (sawOpenParen && depth === 0) {
                calls.push(source.slice(start, i + 1));
                break;
            }
        }
    }
    return calls;
}
//# sourceMappingURL=atomic-state-writes.js.map