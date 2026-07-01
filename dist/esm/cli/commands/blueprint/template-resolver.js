import { readdirSync } from "node:fs";
import path from "node:path";
import { resolvePackageAssetPreferred } from "#utils/package-assets.js";
/**
 * Default templates directory: docs/templates/ in a source checkout, falling
 * back to the shipped catalog/docs/templates/ in the published package (same
 * strategy as resolveRepoBlueprintTemplatePath in router.ts).
 */
function defaultTemplatesDir() {
    return path.dirname(resolvePackageAssetPreferred([
        "docs/templates/blueprint.md",
        "catalog/docs/templates/blueprint.md",
    ]));
}
/**
 * List available templates from `templatesDir` (defaults to docs/templates/).
 *
 * Only `.md` files are returned; names are deduplicated so that both
 * `blueprint.md` and `blueprint.yaml` produce a single entry named "blueprint".
 * Each entry carries the absolute path to the `.md` file.
 */
export function listTemplates(templatesDir) {
    const dir = templatesDir ?? defaultTemplatesDir();
    let entries;
    try {
        entries = readdirSync(dir);
    }
    catch {
        return [];
    }
    const seen = new Set();
    const result = [];
    for (const entry of entries) {
        if (!entry.endsWith(".md"))
            continue;
        const name = path.basename(entry, ".md");
        if (seen.has(name))
            continue;
        seen.add(name);
        result.push({ name, path: path.join(dir, entry) });
    }
    return result;
}
/**
 * Resolve the absolute path to the `.md` template file for `name`.
 *
 * Returns `null` if no matching template exists in `templatesDir`.
 */
export function resolveTemplate(name, templatesDir) {
    const dir = templatesDir ?? defaultTemplatesDir();
    const candidate = path.join(dir, `${name}.md`);
    const templates = listTemplates(dir);
    const found = templates.find((t) => t.name === name);
    if (!found)
        return null;
    // Confirm the path matches what we computed (extra safety)
    return candidate;
}
//# sourceMappingURL=template-resolver.js.map