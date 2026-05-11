/**
 * Detect the consumer repo that `ak init` is running against.
 *
 * Walks for a `.git` directory (the consumer is not required to use pnpm
 * workspaces — single-package projects are fine). Reads `package.json` and
 * `pnpm-workspace.yaml` when present to power downstream template rendering.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
 * Soft warning when the running CLI does not live under the consumer's
 * `node_modules/`. Catches the global-install / pnpm-link / npx case where
 * `ak setup` succeeds against the executing CLI's catalog but produces a
 * non-reproducible `.agents/skills/` tree (symlinks point outside the project
 * tree; lockfile irrelevant). Self-mode short-circuits when the consumer
 * IS `@webpresso/agent-kit` (running setup from agent-kit's own checkout).
 *
 * Non-blocking: prints to stderr and returns. The bc88-class failure
 * (catalog truly missing) is caught by the catch-wrap in `runInit` via
 * `loadContent`'s throw — this is the orthogonal silent-non-determinism
 * class that the catch-wrap doesn't surface.
 */
export function warnIfNonLocalCli(repoRoot, cliUrl = import.meta.url) {
    const ourPkg = readPackageJson(repoRoot).info;
    if (ourPkg?.name === '@webpresso/agent-kit')
        return;
    let cliPath;
    try {
        cliPath = fileURLToPath(cliUrl);
    }
    catch {
        return;
    }
    const localBin = path.join(repoRoot, 'node_modules');
    if (!cliPath.startsWith(localBin + path.sep) && cliPath !== localBin) {
        console.error(`warning: ak running from a non-local install (${cliPath}). ` +
            'Pin `@webpresso/agent-kit` as a local dep for reproducible setup.');
    }
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