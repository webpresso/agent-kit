/**
 * Runner for the TPH audit — thin I/O layer.
 * Finds test files, reads contents, calls detectTphViolations, prints + exits.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectTphViolations } from './audit-tph-detect.js';
import { runShell } from './shell.js';
const SEVERITY_ICONS = {
    ERROR: '❌',
    WARNING: '⚠️ ',
    INFO: 'ℹ️ ',
};
function groupBySeverity(violations) {
    const grouped = new Map();
    for (const v of violations) {
        const existing = grouped.get(v.severity) ?? [];
        existing.push(v);
        grouped.set(v.severity, existing);
    }
    return grouped;
}
function printSeverityGroup(severity, items) {
    const icon = SEVERITY_ICONS[severity] ?? '?';
    console.log(`${icon} ${severity} (${items.length}):`);
    for (const v of items) {
        console.log(`  ${v.file}`);
        console.log(`    [${v.rule}] ${v.message}`);
    }
    console.log();
}
export function printResults(result) {
    console.log('🧪 Testing Philosophy Audit (TPH)');
    console.log('═'.repeat(60));
    console.log(`Files checked: ${result.filesChecked}`);
    console.log();
    if (!result.violations.length) {
        console.log('✅ No violations found!');
        return;
    }
    const grouped = groupBySeverity(result.violations);
    for (const severity of ['ERROR', 'WARNING', 'INFO']) {
        const items = grouped.get(severity);
        if (items && items.length > 0) {
            printSeverityGroup(severity, items);
        }
    }
    console.log('─'.repeat(60));
    console.log(`Summary: ${result.errorCount} errors, ${result.warningCount} warnings, ${result.infoCount} info`);
    if (result.errorCount > 0) {
        console.log('\n❌ Fix ERROR violations before merging.');
    }
}
async function findTestFiles(root) {
    const result = await runShell({
        command: 'find',
        args: [
            '.',
            '-type',
            'f',
            '(',
            '-name',
            '*.test.ts',
            '-o',
            '-name',
            '*.test.tsx',
            '-o',
            '-name',
            '*.integration.test.ts',
            '-o',
            '-name',
            '*.integration.test.tsx',
            ')',
            '-not',
            '-path',
            '*/node_modules/*',
            '-not',
            '-path',
            './.claude/worktrees/*',
            '-not',
            '-path',
            './.tmp/*',
            '-not',
            '-path',
            '*/.generated/*',
            '-not',
            '-path',
            '*/dist/*',
            '-not',
            '-path',
            '*/.stryker-tmp/*',
        ],
        cwd: root,
    });
    return result.stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0);
}
export async function runTphAudit(root, options) {
    const relativePaths = await findTestFiles(root);
    const files = relativePaths.map((relPath) => ({
        path: relPath,
        contents: readFileSync(join(root, relPath), 'utf-8'),
    }));
    const result = detectTphViolations(files, options);
    printResults(result);
    if (result.errorCount > 0) {
        process.exit(1);
    }
}
//# sourceMappingURL=audit-tph-runner.js.map