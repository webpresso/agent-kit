export { createPlaywrightE2ePreset, } from './playwright.js';
const ROOT_PATTERNS = [
    /^(?:.*\/)?apps\/e2e\//u,
    /^(?:.*\/)?apps\/web\/[^/]+\/e2e\//u,
    /^(?:.*\/)?apps\/workers\/[^/]+\/e2e\//u,
];
export function defineE2ePresetSuite(suite) {
    return suite;
}
export function normalizeE2ePresetPath(filePath) {
    const normalizedPath = filePath.replace(/\\/gu, '/').replace(/^\.\/+/u, '');
    for (const pattern of ROOT_PATTERNS) {
        const match = normalizedPath.match(pattern);
        if (match?.index !== undefined) {
            return normalizedPath.slice(match.index + match[0].length);
        }
    }
    return normalizedPath;
}
export function resolveE2ePresetSuite(options) {
    if (options.suite) {
        return options.suites.find((suite) => suite.id === options.suite) ?? null;
    }
    if (!options.file)
        return null;
    const normalizedPath = normalizeE2ePresetPath(options.file);
    return (options.suites.find((suite) => suite.fileMatchers.some((matcher) => normalizedPath.startsWith(matcher))) ?? null);
}
//# sourceMappingURL=index.js.map