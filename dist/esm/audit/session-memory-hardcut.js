import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
const CTX_RS = ["ctx", "rs"].join("-");
const BANNED_STRINGS = [
    CTX_RS,
    `@webpresso/${CTX_RS}`,
    `vendor/${CTX_RS}`,
    `webpresso/${CTX_RS}`,
];
const INCLUDED_PATHS = [
    "bin",
    "src",
    "docs/guides",
    "blueprints/planned",
    "blueprints/in-progress",
    "package.json",
    ".github/workflows",
    "package.contract.test.ts",
    "scripts/public-readiness.ts",
];
const EXCLUDED_SUBSTRINGS = [
    "/bin/runtime/",
    "/docs/research/",
    "/blueprints/parked/",
    "/blueprints/archived/",
];
const TEXT_EXTENSIONS = new Set([
    ".json",
    ".js",
    ".md",
    ".mts",
    ".mjs",
    ".rs",
    ".sh",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
]);
export function auditSessionMemoryHardcut(rootDirectory = process.cwd()) {
    const root = resolve(rootDirectory);
    const violations = [];
    let checked = 0;
    for (const included of INCLUDED_PATHS) {
        const target = join(root, included);
        if (!existsSync(target))
            continue;
        const stats = statSync(target);
        if (stats.isDirectory()) {
            for (const file of walkFiles(target)) {
                if (shouldSkip(file))
                    continue;
                checked += 1;
                collectViolations(root, file, violations);
            }
        }
        else {
            if (shouldSkip(target))
                continue;
            checked += 1;
            collectViolations(root, target, violations);
        }
    }
    return {
        ok: violations.length === 0,
        title: "Session-memory hard-cut live-surface audit",
        checked,
        violations,
    };
}
function walkFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(path));
        }
        else {
            files.push(path);
        }
    }
    return files;
}
function shouldSkip(path) {
    const normalized = path.replaceAll("\\", "/");
    if (EXCLUDED_SUBSTRINGS.some((segment) => normalized.includes(segment)))
        return true;
    const lower = path.toLowerCase();
    if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
        return true;
    const fileBase = basename(path);
    const extension = extname(fileBase);
    if (extension.length === 0)
        return false;
    return !TEXT_EXTENSIONS.has(extension);
}
function collectViolations(root, file, violations) {
    const text = readFileSync(file, "utf8");
    for (const banned of BANNED_STRINGS) {
        if (!text.includes(banned))
            continue;
        violations.push({
            file: relative(root, file),
            message: `Live operational surface still contains banned legacy session-memory string ${JSON.stringify(banned)}`,
        });
    }
}
//# sourceMappingURL=session-memory-hardcut.js.map