const BUILTIN_ROOT_PATTERNS = [
    /^(?:.*\/)?apps\/e2e\//u,
    /^(?:.*\/)?apps\/web\/[^/]+\/e2e\//u,
    /^(?:.*\/)?apps\/workers\/[^/]+\/e2e\//u,
];
export function defineE2eSuite(suite) {
    return suite;
}
export function normalizeE2ePath(filePath, options = {}) {
    const normalizedPath = filePath.replace(/\\/gu, '/').replace(/^\.\/+/u, '');
    const patterns = options.extraRootPatterns
        ? [...BUILTIN_ROOT_PATTERNS, ...options.extraRootPatterns]
        : BUILTIN_ROOT_PATTERNS;
    for (const pattern of patterns) {
        const match = normalizedPath.match(pattern);
        if (match?.index !== undefined) {
            return normalizedPath.slice(match.index + match[0].length);
        }
    }
    return normalizedPath;
}
export function resolveE2eSuiteId(name, suites) {
    return suites.find((suite) => suite.id === name || suite.aliases?.includes(name))?.id ?? null;
}
export function resolveE2eSuiteForPath(filePath, suites, normalizeOptions) {
    const normalizedPath = normalizeE2ePath(filePath, normalizeOptions);
    const suite = suites.find((candidate) => candidate.fileMatchers.some((matcher) => normalizedPath.startsWith(matcher)));
    return suite ? { normalizedPath, suiteId: suite.id } : null;
}
//# sourceMappingURL=suite-registry.js.map