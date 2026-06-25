import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { validateBlueprintTrust } from "#trust/validator.js";
import { parseBlueprintDocumentRelativePath } from "#utils/document-paths.js";
const EXECUTABLE_DIRS = ["planned", "in-progress", "completed"];
export function auditBlueprintTrust(rootDirectory = process.cwd()) {
    const violations = [];
    let checked = 0;
    for (const file of findExecutableBlueprints(rootDirectory)) {
        checked += 1;
        const markdown = readFileSync(path.join(rootDirectory, file), "utf8");
        const status = readStatus(markdown);
        const normalizedStatus = isBlueprintTrustStatus(status) ? status : "planned";
        if (!isBlueprintTrustStatus(status)) {
            violations.push({
                file,
                message: `Frontmatter: unknown status treated as planned: ${status}`,
            });
        }
        const result = validateBlueprintTrust({
            repoRoot: rootDirectory,
            file,
            status: normalizedStatus,
            markdown,
            promotionCandidate: true,
            scanTaskAmbiguity: true,
        });
        for (const violation of result.violations) {
            violations.push({ file, message: `${violation.section}: ${violation.message}` });
        }
    }
    return { ok: violations.length === 0, title: "Blueprint trust", checked, violations };
}
export function findExecutableBlueprints(rootDirectory) {
    const root = path.join(rootDirectory, "blueprints");
    const files = [];
    for (const dir of EXECUTABLE_DIRS)
        walk(path.join(root, dir), files, rootDirectory);
    return files.sort();
}
function walk(dir, files, root) {
    if (!existsSync(dir))
        return;
    const blueprintRoot = path.join(root, "blueprints");
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            walk(full, files, root);
            continue;
        }
        if (!entry.endsWith(".md"))
            continue;
        const relativeToBlueprintRoot = path.relative(blueprintRoot, full);
        if (parseBlueprintDocumentRelativePath(relativeToBlueprintRoot))
            files.push(path.relative(root, full));
    }
}
function readStatus(markdown) {
    const parsed = matter(markdown);
    return typeof parsed.data["status"] === "string" ? parsed.data["status"] : "planned";
}
function isBlueprintTrustStatus(status) {
    return (status === "draft" || status === "planned" || status === "in-progress" || status === "completed");
}
//# sourceMappingURL=blueprint-trust.js.map