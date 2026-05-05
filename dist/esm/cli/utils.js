/**
 * CLI-wide helper utilities.
 *
 * Inlined from webpresso/apps/cli-wp/src/cli-utils.ts (argv normalization,
 * unknown-command formatting) and webpresso/packages/cli/cli-utils
 * (getProjectRoot) so this package has no @webpresso/* runtime dependencies.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------
/**
 * Webpresso framework layout marker — checked last so the webpresso repo
 * itself resolves correctly when it has no `.agent-kitrc.json`. Generic
 * consumers hit `package.json` first and never see this fallback.
 */
const CANONICAL_CONFIG_PATH = 'webpresso/config.yaml';
/**
 * Markers used to detect a project root, in priority order; first hit wins.
 */
export const PROJECT_ROOT_MARKERS = [
    '.agent-kitrc.json',
    'pnpm-workspace.yaml',
    'package.json',
    CANONICAL_CONFIG_PATH,
];
function findMarker(rootDir) {
    for (const marker of PROJECT_ROOT_MARKERS) {
        if (existsSync(path.join(rootDir, marker)))
            return marker;
    }
    return null;
}
/**
 * Walks upward from startDir looking for any marker in
 * `PROJECT_ROOT_MARKERS` (priority order). Throws if nothing is found.
 */
export function findProjectRoot(startDir = process.cwd()) {
    let current = path.resolve(startDir);
    for (;;) {
        if (findMarker(current)) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            throw new Error(`Could not find project root (looked for ${PROJECT_ROOT_MARKERS.join(', ')}). Started from: ${startDir}`);
        }
        current = parent;
    }
}
export function getProjectRoot(options) {
    return findProjectRoot(options?.startDir);
}
// ---------------------------------------------------------------------------
// argv normalization
// ---------------------------------------------------------------------------
/**
 * Normalize process.argv for cac compatibility.
 *
 * When invoked through a script-style wrapper that inserts `--` before
 * `<args>`, the separator lands in argv[2] and prevents cac from seeing the
 * command. Strip it when it appears immediately after the script path.
 */
export function normalizeArgv(argv) {
    return argv.length >= 3 && argv[2] === '--'
        ? [argv[0], argv[1], ...argv.slice(3)]
        : [...argv];
}
// ---------------------------------------------------------------------------
// Unknown-command formatting
// ---------------------------------------------------------------------------
function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (!a.length)
        return b.length;
    if (!b.length)
        return a.length;
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = 0; i < rows; i++)
        dp[i][0] = i;
    for (let j = 0; j < cols; j++)
        dp[0][j] = j;
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[a.length][b.length];
}
function findClosestCommand(input, commands) {
    const scored = commands
        .map((cmd) => ({ cmd, distance: levenshtein(input, cmd) }))
        .filter(({ distance, cmd }) => distance <= Math.max(2, Math.floor(cmd.length / 3)))
        .toSorted((left, right) => left.distance - right.distance);
    if (!scored.length)
        return [];
    const best = scored[0].distance;
    return scored.filter((entry) => entry.distance === best).map((entry) => entry.cmd);
}
/**
 * Format error message for unknown commands with suggestions.
 */
export function formatUnknownCommandError(input, commands, binName = 'ak') {
    const actual = input ?? '';
    const suggestions = findClosestCommand(actual, commands);
    let msg = `Unknown command: ${actual}`;
    if (suggestions.length === 1) {
        msg += `\n\nDid you mean: ${binName} ${suggestions[0]}?`;
    }
    else if (suggestions.length > 1) {
        msg += `\n\nDid you mean one of:\n${suggestions.map((s) => `  ${binName} ${s}`).join('\n')}?`;
    }
    msg += `\n\nRun ${binName} --help to see available commands.`;
    return msg;
}
// ---------------------------------------------------------------------------
// Package metadata (for --version)
// ---------------------------------------------------------------------------
/**
 * Resolve the agent-kit package.json and return its version.
 *
 * Caller must pass `import.meta.url` from a file that lives at
 * `<packageRoot>/src/cli/cli.ts` (source) or `<packageRoot>/dist/cli.js`
 * (bundled). We walk upward until we find a `package.json` whose `name`
 * is `@webpresso/agent-kit`, to be robust against both layouts without
 * having to know how many `..` segments to append.
 */
export function readPackageVersion(metaUrl) {
    const url = new URL(metaUrl);
    let dir = path.dirname(url.pathname);
    for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, 'package.json');
        if (existsSync(candidate)) {
            try {
                const parsed = JSON.parse(readFileSync(candidate, 'utf-8'));
                if (parsed.name === '@webpresso/agent-kit') {
                    return parsed.version ?? '0.0.0';
                }
            }
            catch {
                // keep walking
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return '0.0.0';
}
//# sourceMappingURL=utils.js.map