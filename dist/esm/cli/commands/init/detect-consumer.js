/**
 * Detect the consumer repo that `wp init` is running against.
 *
 * Walks for a `.git` directory (the consumer is not required to use pnpm
 * workspaces — single-package projects are fine). Reads `package.json` and
 * `pnpm-workspace.yaml` when present to power downstream template rendering.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AGENT_KIT_PACKAGE_NAMES = new Set(['@webpresso/agent-kit']);
export function findGitRoot(startDir) {
    let current = path.resolve(startDir);
    for (;;) {
        if (existsSync(path.join(current, '.git')))
            return current;
        const parent = path.dirname(current);
        if (parent === current)
            return null;
        current = parent;
    }
}
export function readPackageJson(repoRoot) {
    const candidate = path.join(repoRoot, 'package.json');
    if (!existsSync(candidate))
        return { path: null, info: null };
    try {
        const raw = readFileSync(candidate, 'utf8');
        const parsed = JSON.parse(raw);
        const name = typeof parsed['name'] === 'string' ? parsed['name'] : path.basename(repoRoot);
        const version = typeof parsed['version'] === 'string' ? parsed['version'] : undefined;
        const deps = (parsed['dependencies'] ?? {});
        const devDeps = (parsed['devDependencies'] ?? {});
        return {
            path: candidate,
            info: { name, version, dependencies: deps, devDependencies: devDeps },
        };
    }
    catch {
        return { path: candidate, info: null };
    }
}
/**
 * Parse `pnpm-workspace.yaml` enough to extract the `packages:` glob list.
 * We avoid pulling in a YAML dep for this — the file format is stable and
 * we only need the `packages:` block.
 */
export function parseWorkspaceGlobs(repoRoot) {
    const wsPath = path.join(repoRoot, 'pnpm-workspace.yaml');
    if (!existsSync(wsPath))
        return null;
    try {
        const raw = readFileSync(wsPath, 'utf8');
        const globs = [];
        let inPackages = false;
        for (const rawLine of raw.split('\n')) {
            const line = rawLine.replace(/\r$/, '');
            if (/^packages:\s*$/.test(line)) {
                inPackages = true;
                continue;
            }
            if (inPackages) {
                const trimmed = line.trim();
                // Stop at a new top-level key
                if (line.length > 0 &&
                    !line.startsWith(' ') &&
                    !line.startsWith('-') &&
                    !line.startsWith('\t')) {
                    inPackages = false;
                    continue;
                }
                const match = /^-\s*['"]?([^'"\s#]+)['"]?/.exec(trimmed);
                if (match && match[1])
                    globs.push(match[1]);
            }
        }
        return globs;
    }
    catch {
        return null;
    }
}
/**
 * Expand a pnpm workspace glob against `repoRoot`, returning resolved
 * package directories that contain a `package.json`.
 *
 * Supports: `pkg/foo`, `pkg/*`, `pkg/**`. Globs are applied at directory
 * boundaries; we don't need full glob semantics.
 */
function safeReaddir(dir) {
    try {
        return readdirSync(dir);
    }
    catch {
        return [];
    }
}
function safeRealpath(target) {
    try {
        return realpathSync(target);
    }
    catch {
        return null;
    }
}
function isWithinPath(target, root) {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function discoverInstalledAgentKitRoots(repoRoot) {
    const roots = new Set();
    for (const directRoot of [path.join(repoRoot, 'node_modules', '@webpresso', 'agent-kit')]) {
        if (existsSync(path.join(directRoot, 'package.json'))) {
            roots.add(directRoot);
        }
    }
    const pnpmRoot = path.join(repoRoot, 'node_modules', '.pnpm');
    for (const entry of safeReaddir(pnpmRoot)) {
        const candidates = [];
        if (entry.startsWith('@webpresso+agent-kit@')) {
            candidates.push(path.join(pnpmRoot, entry, 'node_modules', '@webpresso', 'agent-kit'));
        }
        for (const candidate of candidates) {
            if (existsSync(path.join(candidate, 'package.json'))) {
                roots.add(candidate);
            }
        }
    }
    return [...roots];
}
function isLocalAgentKitCli(repoRoot, cliPath) {
    const cliCandidates = [
        ...new Set([cliPath, safeRealpath(cliPath)].filter((p) => p !== null)),
    ];
    if (cliCandidates.length === 0)
        return false;
    for (const root of discoverInstalledAgentKitRoots(repoRoot)) {
        const rootCandidates = [
            ...new Set([root, safeRealpath(root)].filter((p) => p !== null)),
        ];
        for (const candidate of cliCandidates) {
            if (rootCandidates.some((rootPath) => isWithinPath(candidate, rootPath))) {
                return true;
            }
        }
    }
    return false;
}
function isDirectory(full) {
    try {
        return statSync(full).isDirectory();
    }
    catch {
        return false;
    }
}
function expandGlob(repoRoot, glob) {
    const segments = glob.split('/').filter((s) => s.length > 0);
    let frontier = [repoRoot];
    for (const segment of segments) {
        const next = [];
        for (const dir of frontier) {
            if (!existsSync(dir))
                continue;
            if (segment === '**') {
                const stack = [dir];
                while (stack.length > 0) {
                    const popped = stack.pop();
                    if (popped === undefined)
                        break;
                    next.push(popped);
                    for (const entry of safeReaddir(popped)) {
                        if (entry === 'node_modules' || entry.startsWith('.'))
                            continue;
                        const full = path.join(popped, entry);
                        if (isDirectory(full))
                            stack.push(full);
                    }
                }
            }
            else if (segment === '*') {
                for (const entry of safeReaddir(dir)) {
                    if (entry === 'node_modules' || entry.startsWith('.'))
                        continue;
                    const full = path.join(dir, entry);
                    if (isDirectory(full))
                        next.push(full);
                }
            }
            else {
                const full = path.join(dir, segment);
                if (isDirectory(full))
                    next.push(full);
            }
        }
        frontier = next;
    }
    return frontier;
}
export function discoverWorkspacePackages(repoRoot, globs) {
    if (!globs || globs.length === 0)
        return [];
    const seen = new Set();
    const out = [];
    for (const glob of globs) {
        for (const dir of expandGlob(repoRoot, glob)) {
            const pkgPath = path.join(dir, 'package.json');
            if (seen.has(dir))
                continue;
            if (!existsSync(pkgPath))
                continue;
            seen.add(dir);
            try {
                const raw = readFileSync(pkgPath, 'utf8');
                const parsed = JSON.parse(raw);
                const fullName = typeof parsed.name === 'string' ? parsed.name : path.basename(dir);
                const shortName = fullName.includes('/') ? (fullName.split('/')[1] ?? fullName) : fullName;
                out.push({
                    name: fullName,
                    relativePath: path.relative(repoRoot, dir) || '.',
                    absolutePath: dir,
                    shortName,
                });
            }
            catch {
                /* skip malformed package */
            }
        }
    }
    return out.toSorted((a, b) => a.name.localeCompare(b.name));
}
/**
 * Soft warning for the published-consumer install contract. Consumers run the
 * global Vite+ `wp` binary and depend on `@webpresso/agent-config` for local
 * presets. Source/JIT mode is reserved for this repo via `WP_FORCE_SOURCE=1`.
 */
export function warnIfNonLocalCli(repoRoot, cliUrl = import.meta.url) {
    const ourPkg = readPackageJson(repoRoot).info;
    if (ourPkg?.name !== undefined && AGENT_KIT_PACKAGE_NAMES.has(ourPkg.name))
        return;
    let cliPath;
    try {
        cliPath = fileURLToPath(cliUrl);
    }
    catch {
        return;
    }
    const localAgentKitVersion = ourPkg?.dependencies['@webpresso/agent-kit'] ??
        ourPkg?.devDependencies['@webpresso/agent-kit'] ??
        null;
    const configVersion = ourPkg?.dependencies['@webpresso/agent-config'] ??
        ourPkg?.devDependencies['@webpresso/agent-config'] ??
        null;
    if (isLocalAgentKitCli(repoRoot, cliPath)) {
        console.error(`warning: wp is running from this repo's node_modules (${cliPath}). ` +
            'Consumers must use the global Vite+ install: `vp install -g @webpresso/agent-kit`, then run `wp setup`.');
        return;
    }
    if (typeof localAgentKitVersion === 'string') {
        console.error('warning: unsupported consumer-local @webpresso/agent-kit dependency. ' +
            'Use the global `wp` install and keep only @webpresso/agent-config as the local preset dependency.');
    }
    if (typeof configVersion !== 'string' || !isPublishedSemverRange(configVersion)) {
        console.error('warning: missing or invalid @webpresso/agent-config dependency pin. ' +
            'Consumers must pin a published semver range in package.json, run `vp install`, then use global `wp setup`.');
    }
}
function isPublishedSemverRange(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return false;
    if (trimmed === 'latest')
        return false;
    if (/^(workspace|file|link):/u.test(trimmed))
        return false;
    return /^(?:[~^]?\d+\.\d+\.\d+|[><=]|\*)/u.test(trimmed);
}
/**
 * agent-kit's own package name — the source repo for every agent-surface
 * template (`catalog/`, the tracked `.agent/`/`.claude/` surfaces). Scaffolding
 * into this repo overwrites the canonical sources, so `wp setup` refuses it
 * unless explicitly overridden. Only `@webpresso/agent-kit` hosts the catalog
 * templates.
 */
export const AGENT_KIT_PACKAGE_NAME = '@webpresso/agent-kit';
/** True when the consumer being scaffolded is agent-kit's own template-source repo. */
export function isAgentKitTemplateSourceRepo(packageName) {
    return packageName === AGENT_KIT_PACKAGE_NAME;
}
export function setupCommandForRepo(repoRoot, options = {}) {
    const packageName = readPackageJson(repoRoot).info?.name;
    const restoreHooks = options.restoreHooks === true ? ' --restore-hooks' : '';
    const sourceMaintenance = isAgentKitTemplateSourceRepo(packageName) ? ' --source-maintenance' : '';
    return `wp setup${restoreHooks}${sourceMaintenance}`;
}
export function detectConsumer(startDir = process.cwd()) {
    const repoRoot = findGitRoot(startDir);
    if (!repoRoot)
        return null;
    const { path: pkgPath, info } = readPackageJson(repoRoot);
    const globs = parseWorkspaceGlobs(repoRoot);
    const workspacePackages = discoverWorkspacePackages(repoRoot, globs);
    return {
        repoRoot,
        packageJsonPath: pkgPath,
        packageJson: info,
        hasPnpmWorkspace: globs !== null,
        workspacePackages,
    };
}
//# sourceMappingURL=detect-consumer.js.map