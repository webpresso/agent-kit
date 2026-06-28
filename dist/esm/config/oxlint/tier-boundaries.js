// @ts-nocheck
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const FALLBACK_PACKAGE_TIERS = {
    utils: 0,
    types: 0,
    database: 1,
    ui: 1,
    "app-core": 2,
    "cli-wp": 3,
};
async function loadPackageTiers() {
    const packageBoundaryModuleUrl = pathToFileURL(resolve(process.cwd(), "package-boundaries.js"));
    try {
        const packageBoundaryModule = await import(packageBoundaryModuleUrl.href);
        return packageBoundaryModule.PACKAGE_TIERS ?? FALLBACK_PACKAGE_TIERS;
    }
    catch {
        return FALLBACK_PACKAGE_TIERS;
    }
}
const PACKAGE_TIERS = await loadPackageTiers();
function normalizeFilename(filename) {
    return typeof filename === "string" ? filename.replaceAll("\\", "/") : "";
}
function getFilename(context) {
    if (typeof context.getFilename === "function") {
        return normalizeFilename(context.getFilename());
    }
    return normalizeFilename(context.filename);
}
function getPathSegments(filename) {
    return normalizeFilename(filename).split("/").filter(Boolean);
}
function getWorkspacePackageContext(packageName) {
    const tier = PACKAGE_TIERS[packageName];
    if (typeof tier !== "number") {
        return null;
    }
    return {
        kind: "package",
        packageName,
        tier,
    };
}
export function resolveFileTierContext(filename) {
    const segments = getPathSegments(filename);
    if (segments.includes("infra")) {
        return { kind: "infra" };
    }
    if (segments.includes("packages-public")) {
        return { kind: "packages-public" };
    }
    const packagesIndex = segments.indexOf("packages");
    if (packagesIndex !== -1 && packagesIndex + 2 < segments.length) {
        return getWorkspacePackageContext(segments[packagesIndex + 2]);
    }
    const appsIndex = segments.indexOf("apps");
    if (appsIndex !== -1) {
        const directAppContext = getWorkspacePackageContext(segments[appsIndex + 1]);
        if (directAppContext) {
            return directAppContext;
        }
        if (appsIndex + 2 < segments.length) {
            return getWorkspacePackageContext(segments[appsIndex + 2]);
        }
    }
    return null;
}
export function resolveImportTierContext(source) {
    if (typeof source !== "string") {
        return null;
    }
    if (source.startsWith("packages-public/")) {
        return { kind: "packages-public" };
    }
    if (!source.startsWith("@webpresso/")) {
        return null;
    }
    const packageName = source.slice("@webpresso/".length).split("/")[0];
    return getWorkspacePackageContext(packageName);
}
function reportTierViolation(context, node, fromContext, toContext) {
    context.report({
        node,
        message: `Tier boundary violation: "${fromContext.packageName}" (tier ${fromContext.tier}) must not import higher-tier package "${toContext.packageName}" (tier ${toContext.tier}).`,
    });
}
function checkStaticModuleSource(node, callback) {
    if (!node.source)
        return;
    callback(node.source.value, node.source);
}
const noHigherTierImports = {
    create(context) {
        const fromContext = resolveFileTierContext(getFilename(context));
        if (!fromContext || fromContext.kind !== "package") {
            return {};
        }
        function checkImport(source, node) {
            const toContext = resolveImportTierContext(source);
            if (!toContext || toContext.kind !== "package") {
                return;
            }
            if (toContext.tier > fromContext.tier) {
                reportTierViolation(context, node, fromContext, toContext);
            }
        }
        return {
            ImportDeclaration(node) {
                checkImport(node.source.value, node.source);
            },
            ExportNamedDeclaration(node) {
                checkStaticModuleSource(node, checkImport);
            },
            ExportAllDeclaration(node) {
                checkStaticModuleSource(node, checkImport);
            },
            ImportExpression(node) {
                if (node.source.type !== "Literal")
                    return;
                checkImport(node.source.value, node.source);
            },
        };
    },
};
const plugin = {
    meta: { name: "webpresso-tier-boundaries" },
    rules: {
        "no-higher-tier-imports": noHigherTierImports,
    },
};
export default plugin;
//# sourceMappingURL=tier-boundaries.js.map