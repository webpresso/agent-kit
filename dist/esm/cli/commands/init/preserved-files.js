import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, normalize, relative, resolve } from "node:path";
function resolveManagedPath(root, relativePath) {
    if (isAbsolute(relativePath))
        return null;
    const normalized = normalize(relativePath);
    const absolutePath = resolve(root, normalized);
    const repoRelative = relative(root, absolutePath);
    if (repoRelative === ".." || repoRelative.startsWith("../") || repoRelative.startsWith("..\\")) {
        return null;
    }
    return absolutePath;
}
export function captureConfiguredPreservedFiles(root, config) {
    const preservePaths = config?.setup?.preservePaths ?? [];
    return preservePaths.flatMap((relativePath) => {
        const absolutePath = resolveManagedPath(root, relativePath);
        if (!absolutePath)
            return [];
        if (!existsSync(absolutePath))
            return [];
        return [{ relativePath, content: readFileSync(absolutePath, "utf8") }];
    });
}
export function restoreChangedSnapshots(root, snapshots) {
    const restoredPaths = [];
    for (const snapshot of snapshots) {
        const absolutePath = resolveManagedPath(root, snapshot.relativePath);
        if (!absolutePath)
            continue;
        const currentContent = existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
        if (currentContent === snapshot.content)
            continue;
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, snapshot.content, "utf8");
        restoredPaths.push(snapshot.relativePath);
    }
    return restoredPaths;
}
//# sourceMappingURL=preserved-files.js.map