/**
 * Runner for the TPH E2E audit — thin I/O layer.
 * Finds e2e test files, reads contents, calls detectTphE2eViolations, prints + exits.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectTphE2eViolations, } from "./audit-tph-e2e-detect.js";
import { runShell } from "./shell.js";
const SEVERITY_ICONS = {
    ERROR: "❌",
    WARNING: "⚠️ ",
    INFO: "ℹ️ ",
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
    const icon = SEVERITY_ICONS[severity] ?? "?";
    console.log(`${icon} ${severity} (${items.length}):`);
    for (const v of items) {
        console.log(`  ${v.file}`);
        console.log(`    [${v.rule}] ${v.message}`);
    }
    console.log();
}
export function printResults(result) {
    console.log("🧪 Testing Philosophy Audit (TPH) - E2E");
    console.log("═".repeat(60));
    console.log(`Files checked: ${result.filesChecked}`);
    console.log();
    if (!result.violations.length) {
        console.log("✅ No violations found!");
        return;
    }
    const grouped = groupBySeverity(result.violations);
    for (const severity of ["ERROR", "WARNING", "INFO"]) {
        const items = grouped.get(severity);
        if (items && items.length > 0) {
            printSeverityGroup(severity, items);
        }
    }
    console.log("─".repeat(60));
    console.log(`Summary: ${result.errorCount} errors, ${result.warningCount} warnings, ${result.infoCount} info`);
    if (result.errorCount > 0) {
        console.log("\n❌ Fix ERROR violations before merging.");
    }
}
async function findE2eTestFiles(root) {
    const result = await runShell({
        command: "find",
        args: [
            ".",
            "-type",
            "f",
            "(",
            "-name",
            "*.e2e.test.ts",
            "-o",
            "-name",
            "*.e2e.test.tsx",
            ")",
            "-not",
            "-path",
            "*/node_modules/*",
            "-not",
            "-path",
            "./.claude/worktrees/*",
            "-not",
            "-path",
            "./.tmp/*",
            "-not",
            "-path",
            "*/.generated/*",
            "-not",
            "-path",
            "*/dist/*",
            "-not",
            "-path",
            "*/.stryker-tmp/*",
        ],
        cwd: root,
    });
    return result.stdout
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);
}
export async function runTphE2eAudit(root) {
    const relativePaths = await findE2eTestFiles(root);
    const files = relativePaths.map((relPath) => ({
        path: relPath,
        contents: readFileSync(join(root, relPath), "utf-8"),
    }));
    return detectTphE2eViolations(files);
}
//# sourceMappingURL=audit-tph-e2e-runner.js.map