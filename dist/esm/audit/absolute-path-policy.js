import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
const SKIP_DIRS = new Set([
    ".git",
    "node_modules",
    ".agent",
    ".agents",
    ".claude",
    ".codex",
    ".cursor",
    ".omc",
    ".omx",
    ".opencode",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
    "docs",
    "catalog",
    "blueprints",
    "logs",
    "reports",
    "fixtures",
    "__fixtures__",
    "test-fixtures",
]);
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const TEST_FILE_MARKERS = [".test.", ".spec.", ".integration.test."];
const HARD_CODED_RELATIVE_FILESYSTEM_PATH_PATTERNS = [
    /(?:[A-Za-z_$][\w$]*\.)?(?:resolve|join)\s*\(\s*(?:import\.meta\.dirname|__dirname|process\.cwd\(\))\s*,\s*["'](?:\.\.?\/)+/u,
    /(?:[A-Za-z_$][\w$]*\.)?(?:resolve|join)\s*\(\s*(?:import\.meta\.dirname|__dirname|process\.cwd\(\))\s*,\s*["']\.\.?["']/u,
    /new\s+URL\(\s*["'](?:\.\.?\/)+[^"']*["']\s*,\s*import\.meta\.url\s*\)/u,
];
export function shouldScanAbsolutePathPolicyPath(relativePath) {
    const normalized = relativePath.replace(/\\/gu, "/");
    if (TEST_FILE_MARKERS.some((marker) => normalized.includes(marker)))
        return false;
    if (normalized.endsWith(".d.ts"))
        return false;
    const extensionIndex = normalized.lastIndexOf(".");
    const extension = extensionIndex === -1 ? "" : normalized.slice(extensionIndex);
    return SCAN_EXTENSIONS.has(extension);
}
export function findAbsolutePathPolicyViolationsInText(relativePath, text) {
    const violations = [];
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*"))
            continue;
        if (!HARD_CODED_RELATIVE_FILESYSTEM_PATH_PATTERNS.some((pattern) => pattern.test(line))) {
            continue;
        }
        violations.push({
            file: relativePath,
            message: `hardcoded relative filesystem path at line ${index + 1}; derive an absolute path from an explicit repo/package/runtime anchor instead`,
        });
    }
    return violations;
}
export function auditAbsolutePathPolicy(rootDirectory = process.cwd()) {
    const root = resolve(rootDirectory);
    const violations = [];
    const walk = (directory) => {
        let checked = 0;
        for (const entry of readdirSync(directory)) {
            if (SKIP_DIRS.has(entry))
                continue;
            const fullPath = join(directory, entry);
            let stat;
            try {
                stat = statSync(fullPath);
            }
            catch {
                // Broken symlinks or raced deletions should not crash the audit.
                // Treat them as non-scannable entries and continue.
                continue;
            }
            if (stat.isDirectory()) {
                checked += walk(fullPath);
                continue;
            }
            if (!stat.isFile())
                continue;
            const relativePath = relative(root, fullPath).replace(/\\/gu, "/");
            if (!shouldScanAbsolutePathPolicyPath(relativePath))
                continue;
            checked += 1;
            const text = readFileSync(fullPath, "utf8");
            violations.push(...findAbsolutePathPolicyViolationsInText(relativePath, text));
        }
        return checked;
    };
    const checked = walk(root);
    return {
        ok: violations.length === 0,
        title: "absolute path policy",
        checked,
        violations,
    };
}
//# sourceMappingURL=absolute-path-policy.js.map