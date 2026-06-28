const TEST_FILE_EXTENSIONS = [
    ".test.ts",
    ".test.tsx",
    ".spec.ts",
    ".spec.tsx",
    ".test.js",
    ".test.jsx",
    ".spec.js",
    ".spec.jsx",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mts",
    ".mjs",
    ".cts",
    ".cjs",
];
export function looksLikeTestFilePath(target) {
    const normalized = target.replace(/\\/gu, "/");
    return (normalized.includes("/") ||
        TEST_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension)));
}
export function resolveTestTarget(input) {
    const packageTargets = compact(input.package);
    const fileTargets = compact(input.file);
    const positionalTargets = compact(input.positional);
    if (packageTargets.length > 0 && fileTargets.length > 0) {
        throw new Error("Choose package targets or file targets, not both.");
    }
    if (packageTargets.length > 0) {
        return { type: "package", values: packageTargets };
    }
    if (fileTargets.length > 0) {
        return { type: "file", values: fileTargets };
    }
    if (positionalTargets.length === 0) {
        return { type: "all", values: [] };
    }
    const hasFile = positionalTargets.some(looksLikeTestFilePath);
    const hasPackage = positionalTargets.some((target) => !looksLikeTestFilePath(target));
    if (hasFile && hasPackage) {
        throw new Error("Choose package targets or file targets, not both.");
    }
    return {
        type: hasFile ? "file" : "package",
        values: positionalTargets,
    };
}
function compact(values) {
    return values?.map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
}
//# sourceMappingURL=target-resolver.js.map