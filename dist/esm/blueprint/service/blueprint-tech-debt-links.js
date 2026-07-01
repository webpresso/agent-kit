import matter from "gray-matter";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveTechDebtRoot } from "#utils/tech-debt-root";
export async function linkBlueprintToTechDebt(baseDir, projectPath, bpSlug, tdSlug) {
    const blueprintPath = path.join(baseDir, bpSlug, "_overview.md");
    await updateLinkedSlugs(blueprintPath, "linked_tech_debt_slugs", (linked) => [...linked, tdSlug]);
    const tdPath = path.join(resolveTechDebtRoot(projectPath), tdSlug, "README.md");
    await updateLinkedSlugs(tdPath, "linked_blueprints", (linked) => [...linked, bpSlug]);
}
export async function unlinkBlueprintFromTechDebt(baseDir, projectPath, bpSlug, tdSlug) {
    const blueprintPath = path.join(baseDir, bpSlug, "_overview.md");
    await updateLinkedSlugs(blueprintPath, "linked_tech_debt_slugs", (linked) => linked.filter((slug) => slug !== tdSlug));
    const tdPath = path.join(resolveTechDebtRoot(projectPath), tdSlug, "README.md");
    try {
        await updateLinkedSlugs(tdPath, "linked_blueprints", (linked) => linked.filter((slug) => slug !== bpSlug));
    }
    catch {
        // Tech debt file may not exist during unlink.
    }
}
async function updateLinkedSlugs(filePath, field, transform) {
    const rawContent = await fs.readFile(filePath, "utf-8");
    const parsed = matter(rawContent);
    const data = JSON.parse(JSON.stringify(parsed.data));
    const linked = data[field] ?? [];
    const nextLinked = [...new Set(transform(linked))];
    if (linked.length === nextLinked.length &&
        linked.every((value, index) => value === nextLinked[index])) {
        return;
    }
    data[field] = nextLinked;
    await fs.writeFile(filePath, matter.stringify(parsed.content, data), "utf-8");
}
//# sourceMappingURL=blueprint-tech-debt-links.js.map