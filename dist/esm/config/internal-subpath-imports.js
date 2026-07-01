import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTrustedJsonFile } from "#shared-utils/read-json-file.js";
import { escapeRegExp } from "#utils/string";
const moduleDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(moduleDir, "../..");
const ROOT_PACKAGE_JSON = resolve(REPO_ROOT, "package.json");
function replaceWildcards(value) {
    let captureIndex = 0;
    return value.replaceAll("*", () => `$${++captureIndex}`);
}
function buildFindPattern(specifier) {
    return new RegExp(`^${escapeRegExp(specifier).replaceAll("\\*", "(.*)")}$`, "u");
}
function compareImportSpecificity([leftKey], [rightKey]) {
    const leftStars = leftKey.split("*").length - 1;
    const rightStars = rightKey.split("*").length - 1;
    if (leftStars !== rightStars)
        return leftStars - rightStars;
    return rightKey.length - leftKey.length;
}
export function readCanonicalPackageImports(packageJsonPath = ROOT_PACKAGE_JSON) {
    const manifest = readTrustedJsonFile(packageJsonPath);
    return manifest.imports ?? {};
}
export function getSourcePackageImports(imports) {
    return Object.fromEntries(Object.entries(imports).filter((entry) => entry[0].startsWith("#") && entry[1].startsWith("./src/")));
}
export function createVitestAliasEntriesFromPackageImports(imports = readCanonicalPackageImports(), repoRoot = REPO_ROOT) {
    return Object.entries(getSourcePackageImports(imports))
        .sort(compareImportSpecificity)
        .map(([specifier, target]) => ({
        find: buildFindPattern(specifier),
        // Strip .ts so Vite's resolver handles both foo.ts and foo/index.ts.
        replacement: resolve(repoRoot, replaceWildcards(target.slice(2).replace(/\.ts$/, ""))),
    }));
}
export function resolveVitestAliasSpecifier(specifier, aliases) {
    for (const alias of aliases) {
        const match = specifier.match(alias.find);
        if (!match)
            continue;
        return alias.replacement.replace(/\$(\d+)/gu, (_, index) => {
            const capture = match[Number(index)];
            return capture ?? "";
        });
    }
    return null;
}
//# sourceMappingURL=internal-subpath-imports.js.map