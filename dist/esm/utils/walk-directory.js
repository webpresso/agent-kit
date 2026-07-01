import { readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
export function walkDirectory(root, options = {}) {
    const extensions = options.extensions ? new Set(options.extensions) : undefined;
    const skipDirs = new Set(options.skipDirs ?? []);
    const files = [];
    function walk(dir) {
        const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relativePath = relative(root, fullPath);
            if (entry.isDirectory()) {
                if (!skipDirs.has(entry.name) && !skipDirs.has(relativePath))
                    walk(fullPath);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (extensions && !extensions.has(extname(entry.name)))
                continue;
            if (options.filter && !options.filter({ path: fullPath, relativePath, dirent: entry }))
                continue;
            files.push(options.absolute === false ? relativePath : fullPath);
        }
    }
    if (!statSync(root).isDirectory()) {
        throw new Error(`walkDirectory expected a directory: ${root}`);
    }
    walk(root);
    return files;
}
//# sourceMappingURL=walk-directory.js.map