const SKIP_PATTERNS = [
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/,
    /\.(test|spec)$/,
    /\.e2e\.(ts|tsx|js)$/,
    /\.e2e$/,
    /\.(config|rc)\.(ts|js|mjs|cjs|json|yaml|yml)$/,
    /(^|\/)\.[^/]+rc$/,
    /(^|\/)[^/]+\.(config|rc)$/,
    /\.(json|yaml|yml)$/,
    /\.md$/,
    /\.d\.ts$/,
    /(^|\/)(__tests__|__mocks__|test\/|tests\/|e2e\/)/,
    /(^|\/)node_modules\//,
    /(^|\/)dist\//,
    /(^|\/)build\//,
    /(^|\/)\.(next|wrangler|cache)\//,
    /(^|\/)coverage\//,
    /(^|\/)\.claude\//,
    /(^|\/)\.git\//,
    /\.gitignore$/,
    /(^|\/)infra\//,
    /\.env/,
    /(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb)$/,
];
export function shouldSkipFile(filePath) {
    if (!filePath)
        return false;
    const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    return SKIP_PATTERNS.some((pattern) => pattern.test(normalized));
}
export function getSkipReason(filePath) {
    const skipChecks = [
        { pattern: /\.(test|spec)(\.|$)/, reason: 'test file' },
        { pattern: /\.e2e(\.|$)/, reason: 'e2e test file' },
        { pattern: /\.md$/, reason: 'documentation' },
        { pattern: /\.(config|rc)(\.|$)/, reason: 'config file' },
        { pattern: /\.(json|yaml|yml)$/, reason: 'data file' },
        { pattern: /\.d\.ts$/, reason: 'type definitions' },
        { pattern: /node_modules/, reason: 'node_modules' },
        { pattern: /\.claude\//, reason: 'Claude config' },
        { pattern: /infra\//, reason: 'infrastructure' },
    ];
    for (const { pattern, reason } of skipChecks) {
        if (pattern.test(filePath))
            return reason;
    }
    return 'excluded file';
}
export function validateBlueprint(filePath, options) {
    const bypassEnabled = options?.bypassEnabled ??
        (process.env.BLUEPRINT_GUARD_SKIP === '1' || process.env.DBLUEPRINT_GUARD_SKIP === '1');
    if (bypassEnabled) {
        return {
            valid: true,
            reason: 'Bypass enabled (BLUEPRINT_GUARD_SKIP=1)',
            details: { skipReason: 'Bypass enabled (BLUEPRINT_GUARD_SKIP=1)' },
        };
    }
    if (filePath && shouldSkipFile(filePath)) {
        const skipReason = getSkipReason(filePath);
        return { valid: true, reason: `Skipped: ${skipReason}`, details: { skipReason } };
    }
    return {
        valid: true,
        reason: 'Production file requires implementation plan (to be validated in Phase 6)',
        details: { hasPlan: undefined },
    };
}
export function parseFrontmatter(content) {
    if (!content.startsWith('---'))
        return null;
    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1)
        return null;
    const frontmatterText = content.slice(3, endIndex).trim();
    const result = {};
    for (const line of frontmatterText.split('\n')) {
        if (!line.trim() || line.startsWith('#'))
            continue;
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1)
            continue;
        const key = line.slice(0, colonIndex).trim();
        const value = line
            .slice(colonIndex + 1)
            .trim()
            .replace(/^["']|["']$/g, '');
        result[key] = value;
    }
    return Object.keys(result).length > 0 ? result : null;
}
export function isActivePlan(frontmatter) {
    if (!frontmatter)
        return false;
    const status = String(frontmatter.status || '').toLowerCase();
    return status === 'in-progress' || status === 'draft';
}
//# sourceMappingURL=blueprint.js.map