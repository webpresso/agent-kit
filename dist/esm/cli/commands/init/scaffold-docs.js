/**
 * Copy `catalog/docs/templates/` into the consumer's `docs/templates/`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { copyDirectoryMerged } from "./merge.js";
export function scaffoldDocs(input) {
    const { catalogDir, repoRoot, options } = input;
    const src = join(catalogDir, "docs", "templates");
    if (!existsSync(src))
        return [];
    const dst = join(repoRoot, "docs", "templates");
    return copyDirectoryMerged(src, dst, options);
}
//# sourceMappingURL=scaffold-docs.js.map