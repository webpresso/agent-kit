/**
 * Soft compatibility preflight for `wp setup`.
 *
 * Checks the 5-point compatibility matrix from docs/is-agent-kit-for-me.md.
 * In non-strict mode: warns and continues. In strict mode: aborts on mismatch.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveBlueprintRoot } from '#utils/blueprint-root';
export const DOCS_URL = 'https://github.com/webpresso/agent-kit/blob/main/docs/is-agent-kit-for-me.md';
/**
 * Returns the major version number from a semver string like "24.0.0" or "v24.0.0".
 * Returns null when the string is not parseable.
 */
function parseMajor(version) {
    const cleaned = version.startsWith('v') ? version.slice(1) : version;
    const major = parseInt(cleaned.split('.')[0] ?? '', 10);
    return isNaN(major) ? null : major;
}
function checkTypeScriptWorkspace(repoRoot) {
    const hasConfig = existsSync(join(repoRoot, 'tsconfig.json'));
    if (!hasConfig) {
        return 'tsconfig.json not found at repo root — TypeScript workspace required (see docs)';
    }
    const nodeMajor = parseMajor(process.version);
    if (nodeMajor === null || nodeMajor < 24) {
        return `Node ${process.version} detected — Node ≥ 24 required (see docs)`;
    }
    return null;
}
function checkVp() {
    const result = spawnSync('vp', ['--version'], { encoding: 'utf8' });
    if (result.error !== undefined || (result.status !== null && result.status !== 0)) {
        return 'vp not found on PATH — install Vite+ and use vp as the package-command facade (see docs)';
    }
    return null;
}
function checkWorkersOrVite(repoRoot) {
    const hasWrangler = existsSync(join(repoRoot, 'wrangler.toml'));
    const hasVite = existsSync(join(repoRoot, 'vite.config.ts'));
    if (!hasWrangler && !hasVite) {
        return 'Neither wrangler.toml nor vite.config.ts found at repo root — Workers or Vite project required (see docs)';
    }
    return null;
}
function checkBlueprintLifecycle(repoRoot) {
    const blueprintRoot = resolveBlueprintRoot(repoRoot);
    if (!existsSync(blueprintRoot)) {
        const displayPath = relative(repoRoot, blueprintRoot).replaceAll('\\', '/') || 'blueprints';
        return `${displayPath}/ directory not found — blueprint lifecycle required (run \`wp setup --with base-kit\` to scaffold it)`;
    }
    return null;
}
function checkLoreCommitProtocol(repoRoot) {
    if (!existsSync(join(repoRoot, '.agent'))) {
        return '.agent/ directory not found — lore commit protocol required (run `wp setup --with lore-commits` to scaffold it)';
    }
    return null;
}
/**
 * Run the 5-point compatibility preflight.
 *
 * @param repoRoot - Absolute path to the consumer repo root.
 * @param strict   - When true, `ok` is false if any check fails.
 *                   When false, `ok` is always true (warn-only mode).
 */
export async function runPreflight(repoRoot, strict) {
    const checks = [
        () => checkTypeScriptWorkspace(repoRoot),
        () => checkVp(),
        () => checkWorkersOrVite(repoRoot),
        () => checkBlueprintLifecycle(repoRoot),
        () => checkLoreCommitProtocol(repoRoot),
    ];
    const warnings = [];
    for (const check of checks) {
        const warning = check();
        if (warning !== null) {
            warnings.push(warning);
        }
    }
    const score = checks.length - warnings.length;
    const ok = strict ? warnings.length === 0 : true;
    return { ok, score, warnings };
}
//# sourceMappingURL=preflight.js.map