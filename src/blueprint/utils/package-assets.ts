import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface FindPackageAssetOptions {
  readonly moduleUrl?: string;
  readonly cwd?: string;
  readonly execPath?: string;
  readonly argv0?: string;
  readonly argv1?: string;
}

function isBunVirtualPath(filePath: string): boolean {
  return filePath === "/$bunfs/root" || filePath.startsWith("/$bunfs/root/");
}

function modulePathFromUrl(moduleUrl: string): string | null {
  try {
    return fileURLToPath(moduleUrl);
  } catch {
    return null;
  }
}

function isUsableStartPath(filePath: string | null | undefined): filePath is string {
  return typeof filePath === "string" && filePath.length > 0 && !isBunVirtualPath(filePath);
}

/**
 * Resolve the installed `@webpresso/agent-kit` package root via Node module
 * resolution anchored on `cwd`. Unlike the module/argv/execPath start paths,
 * this works even when the CLI runs as a bundled Bun single-file binary — where
 * `import.meta.url` and `process.argv` are `/$bunfs/root/...` virtual paths and
 * `process.execPath` is the Bun binary, none of which point at the package on
 * disk. Returns `null` when the package cannot be resolved (e.g. a consumer cwd
 * without it installed, or an unbuilt checkout missing the `./package.json`
 * export), so callers fall through to the other start paths.
 */
function agentKitPackageRoot(cwd: string): string | null {
  try {
    const requireFromCwd = createRequire(path.join(cwd, "noop.cjs"));
    return path.dirname(requireFromCwd.resolve("@webpresso/agent-kit/package.json"));
  } catch {
    return null;
  }
}

function findFromStartPath(startPath: string, relativeFromRoot: string): string | null {
  let dir = path.dirname(startPath);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, relativeFromRoot);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Walk up from this file's location looking for `relativeFromRoot`. Returns the
 * first existing match, or `null` if none is found within the ancestor budget.
 */
export function findPackageAsset(
  relativeFromRoot: string,
  options: FindPackageAssetOptions = {},
): string | null {
  const packageRoot = agentKitPackageRoot(options.cwd ?? process.cwd());
  const starts = [
    modulePathFromUrl(options.moduleUrl ?? import.meta.url),
    // Node-resolution anchor: survives bundled-Bun execution where every other
    // start path is virtual / the Bun binary.
    packageRoot === null ? null : path.join(packageRoot, "package.json"),
    options.argv1 ?? process.argv[1],
    options.execPath ?? process.execPath,
    options.argv0 ?? process.argv[0],
    path.join(options.cwd ?? process.cwd(), "package.json"),
  ];

  for (const start of starts) {
    if (!isUsableStartPath(start)) continue;
    const found = findFromStartPath(start, relativeFromRoot);
    if (found) return found;
  }
  return null;
}

/**
 * Walk up from this file's location until the given path (relative to the
 * package root) is found. Works whether running from src/ or dist/esm/.
 */
export function resolvePackageAsset(relativeFromRoot: string): string {
  return findPackageAsset(relativeFromRoot) ?? path.join(process.cwd(), relativeFromRoot);
}

/**
 * Resolve the first existing candidate, in priority order. Use when an asset
 * lives at one path in the source checkout but a different path in the
 * published tarball — e.g. templates authored under repo-root `docs/templates/`
 * but shipped under `catalog/docs/templates/` because the npm `files` list
 * includes `catalog/` and not `docs/`. Prefers the dev/source location and
 * falls back to the shipped one, mirroring `bin/_run.js`'s source→built path
 * translation. Falls back to cwd-relative on the first candidate when none
 * exist, matching `resolvePackageAsset`'s last-resort behavior.
 */
export function resolvePackageAssetPreferred(candidates: readonly string[]): string {
  for (const relativeFromRoot of candidates) {
    const found = findPackageAsset(relativeFromRoot);
    if (found) return found;
  }
  const primary = candidates[0];
  if (primary === undefined) {
    throw new Error("resolvePackageAssetPreferred requires at least one candidate path");
  }
  return path.join(process.cwd(), primary);
}
