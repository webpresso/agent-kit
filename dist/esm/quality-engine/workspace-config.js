/**
 * Workspace Configuration
 *
 * Single source of truth for workspace path patterns and path-based checks.
 * Consolidates duplicated patterns from typecheck.ts, qa.ts, test.ts, and pre-commit hook.
 *
 * @module
 */
// =============================================================================
// Package Path Patterns
// =============================================================================
/**
 * Patterns to extract package paths from file paths.
 * Used by typecheck, qa, and lint commands to scope checks to affected packages.
 *
 * Previously duplicated in:
 * - apps/cli2/src/commands/typecheck.ts (PACKAGE_PATTERNS)
 * - apps/cli2/src/commands/qa.ts (PACKAGE_PATTERNS)
 */
export const PACKAGE_PATTERNS = [
    /^(packages\/[^/]+\/[^/]+)/, // packages/foundation/config, packages/core/database, etc.
    /^(apps\/web\/[^/]+)/,
    /^(apps\/workers\/[^/]+)/,
    /^(apps\/containers\/[^/]+)/,
    /^(infra)(?:\/|$)/, // Match 'infra' only when followed by / or end of string
    /^(apps\/[^/]+)/, // Catch-all for other top-level apps (app-core, desktop, etc.)
];
/**
 * Extract the package path from a file path.
 */
export function extractPackagePath(filePath) {
    // Remove leading ./ if present
    const normalized = filePath.replace(/^\.\//, '');
    for (const pattern of PACKAGE_PATTERNS) {
        const match = normalized.match(pattern);
        if (match?.[1])
            return match[1];
    }
    return null;
}
// =============================================================================
// Project Root Detection (Vitest)
// =============================================================================
/**
 * Detect which project root a file belongs to based on its path.
 * Uses PACKAGE_PATTERNS to auto-detect — all packages with # support work automatically.
 */
export function detectProjectRoot(filePath) {
    return extractPackagePath(filePath) ?? undefined;
}
/**
 * Path-based checks configuration.
 * When staged files match the pattern, the corresponding command runs.
 *
 * Note: All commands should use 'just' (Just-First principle).
 */
export const PATH_CHECKS = [
    {
        pattern: /^apps\/workers\/chef\//,
        emoji: '🍳',
        name: 'Chef',
        command: 'just test --package chef',
    },
    {
        pattern: /^apps\/web\/platform-web\/app\/(components|routes)\/.*\.tsx$/,
        emoji: '♿',
        name: 'Platform Web A11y',
        command: 'just test --package platform-web -- -t Accessibility',
    },
    {
        pattern: /^apps\/web\/admin-web\/app\/(components|routes)\/.*\.tsx$/,
        emoji: '♿',
        name: 'Admin Web A11y',
        command: 'just test --package admin-web -- -t Accessibility',
    },
    {
        pattern: /^apps\/web\/website\/app\/(components|routes)\/.*\.tsx$/,
        emoji: '♿',
        name: 'Website A11y',
        command: 'just test --package website -- -t Accessibility',
    },
];
/**
 * Validate a path check configuration.
 * Returns error message if invalid, undefined if valid.
 */
export function validatePathCheck(check) {
    if (!check.pattern) {
        return 'Missing pattern';
    }
    if (!check.name) {
        return 'Missing name';
    }
    if (!check.command) {
        return 'Missing command';
    }
    if (check.healthUrl && !check.healthUrl.startsWith('http')) {
        return `Invalid health URL: ${check.healthUrl}`;
    }
    return undefined;
}
/**
 * Validate all path checks.
 * Throws if any check is invalid.
 */
export function validateAllPathChecks() {
    for (const check of PATH_CHECKS) {
        const error = validatePathCheck(check);
        if (error) {
            throw new Error(`Invalid PATH_CHECK '${check.name}': ${error}`);
        }
    }
}
/**
 * Find matched path checks for a list of files.
 */
export function getMatchedPathChecks(files) {
    const matched = [];
    const seen = new Set();
    for (const check of PATH_CHECKS) {
        for (const file of files) {
            if (check.pattern.test(file) && !seen.has(check.name)) {
                matched.push(check);
                seen.add(check.name);
                break;
            }
        }
    }
    return matched;
}
//# sourceMappingURL=workspace-config.js.map