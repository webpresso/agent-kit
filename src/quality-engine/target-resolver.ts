import { existsSync, readdirSync, readFileSync, statSync, type Dirent, type Stats } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

// =============================================================================
// Types
// =============================================================================

/** Target resolution type */
export type TargetType = "all" | "file" | "package";

/** Result of resolving a target string. */
export interface ResolvedTarget {
  type: TargetType;
  value: string[];
}

/** Accepted command flag inputs (variadic: Commander provides string[]) */
export interface CommandTargetOptions {
  package?: string[];
  file?: string[];
}

/** Package information from workspace */
export interface PackageInfo {
  name: string;
  path: string;
}

// =============================================================================
// File System Abstraction (for testability)
// =============================================================================

/** File system operations interface for dependency injection */
export interface FileSystem {
  existsSync: (path: string) => boolean;
  statSync: (path: string) => Stats;
  readdirSync: (path: string) => Dirent[];
  readFileSync: (path: string) => string;
}

/** Default file system implementation using Node.js fs */
export const defaultFs: FileSystem = {
  existsSync: (path) => existsSync(path),
  statSync: (path) => statSync(path),
  readdirSync: (path) => readdirSync(path, { withFileTypes: true }),
  readFileSync: (path) => readFileSync(path, "utf8"),
};

/** Dependencies that can be injected for testing */
export interface ResolverDeps {
  fs?: FileSystem;
  repoRoot?: string;
  workspacePackages?: PackageInfo[];
  /** Bypass ambiguity checks (for backward compatibility) */
  force?: boolean;
}

// =============================================================================
// Constants (exported for testing and verification)
// =============================================================================

/** Directories containing subdirectory packages */
export const SUBDIRECTORY_PACKAGES = [
  "apps",
  "apps/web",
  "apps/workers",
  "apps/containers",
  "apps/agile-vibe",
  "packages/foundation",
  "packages/core",
  "packages/cli",
  "packages/feature",
  "packages/sdk",
] as const;

/** Root-level package directories */
export const ROOT_LEVEL_PACKAGES = ["infra"] as const;

/** Category queries that match multiple packages */
export const CATEGORY_QUERIES = ["platform", "admin", "website"] as const;

/** Directories to skip when scanning for packages */
export const SKIP_DIRECTORIES = ["templates", "node_modules"] as const;

/** Maximum depth when searching for repo root */
export const MAX_REPO_SEARCH_DEPTH = 100;

/** Workspace marker file */
export const WORKSPACE_MARKER = "pnpm-workspace.yaml";

/** File extensions that indicate a file target (not a package name) */
export const FILE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
  ".cts",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".html",
  ".vue",
  ".svelte",
] as const;

/** Common path prefixes to try when resolving partial paths */
export const PATH_PREFIXES = [
  "packages/foundation",
  "packages/core",
  "packages/cli",
  "packages/feature",
  "packages/sdk",
  "apps/web",
  "apps/workers",
  "apps/containers",
  "apps/agile-vibe",
] as const;

export function getPackageShortName(packageName: string): string {
  if (packageName.startsWith("@")) {
    const [, scopedName] = packageName.split("/");
    return scopedName ?? packageName;
  }

  return packageName;
}

function getResolverWorkspacePackages(deps: ResolverDeps): PackageInfo[] {
  if (deps.workspacePackages) {
    return deps.workspacePackages;
  }

  if (deps.repoRoot) {
    return getWorkspacePackages(deps.repoRoot, deps.fs ?? defaultFs);
  }

  throw new Error(
    "Package resolution requires explicit workspace context. Pass repoRoot or workspacePackages.",
  );
}

function normalizeWorkspacePattern(pattern: string): string {
  return pattern.trim().replace(/^\.\//, "");
}

function readWorkspacePatterns(repoRoot: string, fs: FileSystem = defaultFs): string[] | undefined {
  const workspacePath = join(repoRoot, WORKSPACE_MARKER);

  if (!fs.existsSync(workspacePath)) {
    return undefined;
  }

  try {
    const parsed = parseYaml(fs.readFileSync(workspacePath)) as { packages?: unknown };
    if (!Array.isArray(parsed?.packages)) {
      return undefined;
    }

    return parsed.packages.filter((value): value is string => typeof value === "string");
  } catch {
    return undefined;
  }
}

// =============================================================================
// Pure Helper Functions (all exported for unit testing)
// =============================================================================

/**
 * Common flag-like patterns that users might accidentally pass as targets.
 * Each pattern maps to the correct flag syntax for the error message.
 */
const COMMON_FLAG_TYPOS: ReadonlyMap<string, string> = new Map([
  ["fix", "--fix"],
  ["fix-unsafe", "--fix-unsafe"],
  ["--fix", "--fix (place after target, e.g., `just lint . --fix`)"],
  ["--fix-unsafe", "--fix-unsafe (place after target, e.g., `just lint . --fix-unsafe`)"],
  ["write", "--write"],
  ["unsafe", "--unsafe"],
  ["continue", "--continue"],
]);

/**
 * Check if a target string looks like a file path based on its extension.
 * This is a pure string check — no filesystem access.
 */
export function looksLikeFilePath(target: string): boolean {
  return FILE_EXTENSIONS.some((ext) => target.endsWith(ext));
}

/**
 * Check if a target looks like a mistyped flag argument.
 * Returns the correct flag syntax if matched, or null if not a flag typo.
 */
function detectFlagTypo(target: string): string | null {
  const trimmed = target.trim().toLowerCase();
  return COMMON_FLAG_TYPOS.get(trimmed) ?? null;
}

/**
 * Find repository root by looking for pnpm-workspace.yaml
 * @param startDir - Directory to start searching from
 * @param fs - File system interface (injectable for testing)
 * @returns Path to repository root, or startDir if not found
 */
export function findRepoRoot(startDir: string, fs: FileSystem = defaultFs): string {
  let current = startDir;

  for (let depth = 0; depth < MAX_REPO_SEARCH_DEPTH; depth += 1) {
    if (fs.existsSync(join(current, WORKSPACE_MARKER))) {
      return current;
    }

    const parent = join(current, "..");
    const resolved = resolve(parent);

    if (resolved === current) {
      return startDir;
    }

    current = resolved;
  }

  return startDir;
}

/**
 * Check if a path exists as a file (not a directory - directories are treated as packages)
 * @param target - Path to check (absolute or relative to repoRoot)
 * @param repoRoot - Repository root for resolving relative paths
 * @param fs - File system interface (injectable for testing)
 * @returns true if the path exists as a file
 */
export function isFilePath(target: string, repoRoot: string, fs: FileSystem = defaultFs): boolean {
  const absolutePath = target.startsWith("/") ? target : join(repoRoot, target);

  try {
    const stat = fs.statSync(absolutePath);
    // Only return true for files - directories should be treated as packages
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Generate all candidate paths to try for a given target.
 * Pure function - no filesystem access, fully testable.
 *
 * @param target - The target path (may be partial like "cli2/src/cli.ts")
 * @returns Array of candidate paths to try, in priority order
 */
export function generatePathCandidates(target: string): string[] {
  // Absolute paths have only one candidate
  if (target.startsWith("/")) {
    return [target];
  }

  // For relative paths, try as-is first, then with common prefixes
  const candidates = [target];

  for (const prefix of PATH_PREFIXES) {
    candidates.push(join(prefix, target));
  }

  return candidates;
}

/**
 * Find the first existing path from a list of candidates.
 * Separates filesystem access from path generation for testability.
 *
 * @param candidates - Array of candidate paths to check
 * @param repoRoot - Repository root for resolving relative paths
 * @param fs - File system interface (injectable for testing)
 * @returns The first existing path, or null if none exist
 */
export function findFirstExistingPath(
  candidates: string[],
  repoRoot: string,
  fs: FileSystem = defaultFs,
): string | null {
  for (const candidate of candidates) {
    if (isFilePath(candidate, repoRoot, fs)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve a partial path by trying common prefixes.
 * Composed from pure generatePathCandidates + findFirstExistingPath.
 *
 * @param target - Partial path to resolve (e.g., "cli2/src/cli.ts")
 * @param repoRoot - Repository root for resolving paths
 * @param fs - File system interface (injectable for testing)
 * @returns Resolved full path if found, or null if not found
 */
export function resolvePartialPath(
  target: string,
  repoRoot: string,
  fs: FileSystem = defaultFs,
): string | null {
  const candidates = generatePathCandidates(target);
  return findFirstExistingPath(candidates, repoRoot, fs);
}

/**
 * Read package.json and extract package info
 * @param packagePath - Path to the package directory
 * @param fs - File system interface (injectable for testing)
 * @returns PackageInfo or null if package.json is invalid/missing
 */
export function readPackageInfo(
  packagePath: string,
  fs: FileSystem = defaultFs,
): PackageInfo | null {
  const packageJsonPath = join(packagePath, "package.json");

  try {
    const content = fs.readFileSync(packageJsonPath);
    const packageJson = JSON.parse(content) as { name?: string };

    if (typeof packageJson.name === "string") {
      return { name: packageJson.name, path: packagePath };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a directory entry should be skipped
 * @param name - Directory name to check
 * @returns true if the directory should be skipped
 */
export function shouldSkipDirectory(name: string): boolean {
  return (SKIP_DIRECTORIES as readonly string[]).includes(name);
}

/**
 * Get packages from a subdirectory (e.g., apps/web, packages)
 * @param baseDir - Full path to the base directory
 * @param fs - File system interface (injectable for testing)
 * @returns Array of PackageInfo for valid packages in the directory
 */
export function getSubdirectoryPackages(
  baseDir: string,
  fs: FileSystem = defaultFs,
): PackageInfo[] {
  const packages: PackageInfo[] = [];

  try {
    const entries = fs.readdirSync(baseDir);

    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) {
        continue;
      }

      const packagePath = join(baseDir, entry.name);
      const info = readPackageInfo(packagePath, fs);

      if (info) {
        packages.push(info);
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return packages;
}

function getRecursivePackages(baseDir: string, fs: FileSystem = defaultFs): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const packageInfo = readPackageInfo(baseDir, fs);

  if (packageInfo) {
    packages.push(packageInfo);
    return packages;
  }

  try {
    const entries = fs.readdirSync(baseDir);

    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) {
        continue;
      }

      packages.push(...getRecursivePackages(join(baseDir, entry.name), fs));
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return packages;
}

function getPackagesForWorkspacePattern(
  repoRoot: string,
  pattern: string,
  fs: FileSystem = defaultFs,
): PackageInfo[] {
  const normalized = normalizeWorkspacePattern(pattern);

  if (!normalized) {
    return [];
  }

  if (!normalized.includes("*")) {
    const packageInfo = readPackageInfo(join(repoRoot, normalized), fs);
    return packageInfo ? [packageInfo] : [];
  }

  if (normalized.endsWith("/**")) {
    const baseDir = normalized.slice(0, -3);
    return getRecursivePackages(join(repoRoot, baseDir), fs);
  }

  if (normalized.endsWith("/*")) {
    const baseDir = normalized.slice(0, -2);
    return getSubdirectoryPackages(join(repoRoot, baseDir), fs);
  }

  return [];
}

/**
 * Get all workspace packages dynamically
 * @param repoRoot - Repository root path
 * @param fs - File system interface (injectable for testing)
 * @returns Array of all PackageInfo in the workspace
 */
export function getWorkspacePackages(repoRoot: string, fs: FileSystem = defaultFs): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const workspacePatterns = readWorkspacePatterns(repoRoot, fs);
  const patterns =
    workspacePatterns && workspacePatterns.length > 0
      ? workspacePatterns
      : [...SUBDIRECTORY_PACKAGES.map((dir) => `${dir}/*`), ...ROOT_LEVEL_PACKAGES];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    for (const pkg of getPackagesForWorkspacePattern(repoRoot, pattern, fs)) {
      if (seen.has(pkg.path)) continue;
      seen.add(pkg.path);
      packages.push(pkg);
    }
  }

  return packages;
}

/**
 * Check if a package matches a query string
 * @param pkg - Package info to check
 * @param query - Query string to match against
 * @returns true if the package matches the query
 */
export function matchPackage(pkg: PackageInfo, query: string): boolean {
  const shortName = getPackageShortName(pkg.name);
  const normalizedPath = pkg.path.replace(/\\/g, "/");
  const pathSegments = normalizedPath.split("/").filter(Boolean);
  const leafDir = pathSegments.at(-1) ?? "";

  return (
    pkg.name === query ||
    shortName === query ||
    pkg.path === query ||
    normalizedPath === query ||
    leafDir === query ||
    pkg.name.includes(query) ||
    shortName.includes(query) ||
    pkg.path.includes(query)
  );
}

/**
 * Check if a query is a category query (platform, admin, website)
 * @param query - Query string to check
 * @returns true if the query is a category query
 */
export function isCategoryQuery(query: string): boolean {
  return (CATEGORY_QUERIES as readonly string[]).includes(query);
}

function matchCategoryPackage(pkg: PackageInfo, query: string): boolean {
  const shortName = getPackageShortName(pkg.name);

  if (query === "website") {
    return shortName === "website";
  }

  return (
    shortName === `${query}-web` || shortName === `${query}-api` || shortName === `${query}-worker`
  );
}

/**
 * Parse a target string into individual query tokens
 * @param target - Target string (may contain commas or whitespace)
 * @returns Array of trimmed, non-empty query tokens
 */
export function parseQueryTokens(target: string): string[] {
  return target
    .split(",")
    .flatMap((token) => token.split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Find packages matching a single query
 * @param packages - Array of workspace packages
 * @param query - Query string to match
 * @returns Array of matching PackageInfo
 */
export function findMatchingPackages(packages: PackageInfo[], query: string): PackageInfo[] {
  if (isCategoryQuery(query)) {
    return packages.filter((pkg) => matchCategoryPackage(pkg, query));
  }

  const exactMatches = packages.filter((pkg) => {
    const shortName = getPackageShortName(pkg.name);
    const normalizedPath = pkg.path.replace(/\\/g, "/");
    const pathSegments = normalizedPath.split("/").filter(Boolean);
    const leafDir = pathSegments.at(-1) ?? "";

    return (
      pkg.name === query ||
      shortName === query ||
      pkg.path === query ||
      normalizedPath === query ||
      leafDir === query
    );
  });

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const directMatches = packages.filter((pkg) => matchPackage(pkg, query));

  if (directMatches.length > 0) {
    return directMatches;
  }

  return [];
}

/**
 * Resolve package targets to workspace filter flags
 * @param target - Target string to resolve
 * @param packages - Array of workspace packages
 * @returns Array of workspace filter flags (e.g., ['--filter=@scope/cli'])
 */
export function resolvePackageFilters(target: string, packages: PackageInfo[]): string[] {
  return resolveMatchingPackages(target, packages).map((pkg) => `--filter=${pkg.name}`);
}

/**
 * Resolve package targets to directory paths (relative to repo root)
 * @param target - Target string to resolve
 * @param packages - Array of workspace packages
 * @returns Array of package directory paths (e.g., ['packages/cli2', 'packages/config'])
 */
export function resolvePackagePaths(target: string, packages: PackageInfo[]): string[] {
  return resolveMatchingPackages(target, packages).map((pkg) => pkg.path);
}

function resolveMatchingPackages(target: string, packages: PackageInfo[]): PackageInfo[] {
  const queries = parseQueryTokens(target);

  if (!queries.length) {
    return [];
  }

  const matches: PackageInfo[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    for (const pkg of findMatchingPackages(packages, query)) {
      if (!seen.has(pkg.path)) {
        seen.add(pkg.path);
        matches.push(pkg);
      }
    }
  }

  return matches;
}

// =============================================================================
// Main API Functions
// =============================================================================

/**
 * Resolve a target string to package filters (strict mode).
 * Only package/category queries are allowed here.
 */
export function resolveTargetStrict(target?: string, deps: ResolverDeps = {}): ResolvedTarget {
  const trimmed = target?.trim() ?? "";

  if (trimmed === "") return { type: "all", value: [] };

  // Check for common flag typos
  const flagCorrection = detectFlagTypo(trimmed);
  if (flagCorrection) {
    throw new Error(
      `Invalid target "${trimmed}" - this looks like a flag argument.\n` +
        `Did you mean: ${flagCorrection}\n` +
        `Example: just lint . ${flagCorrection}`,
    );
  }

  // Try to resolve as package
  const packages = getResolverWorkspacePackages(deps);
  const filters = resolvePackageFilters(trimmed, packages);
  if (filters.length > 0) return { type: "package", value: filters };

  // Not a package - reject
  throw new Error(
    `Package not found: "${trimmed}". Use --file for file targets.\n` +
      `Example: just test --package ${trimmed} or just test --file path/to/test.ts`,
  );
}

/**
 * Resolve command targets based on explicit flags (strict mode).
 * Rejects ambiguous inputs with clear error messages.
 */
/**
 * Resolve command targets based on explicit flags (strict mode).
 * Positional arguments are validated but require a flag to apply.
 */
export function resolveCommandTargets(
  commandName: string,
  positionalTargets: string[],
  options: CommandTargetOptions = {},
  deps: ResolverDeps = {},
): ResolvedTarget {
  const positionalTarget = getSinglePositionalTarget(positionalTargets);

  if (options.package !== undefined && options.file !== undefined) {
    throw new Error("Cannot use both --package and --file");
  }

  if (options.package !== undefined) {
    const packages = normalizeVariadicFlag("--package", options.package);
    assertNoPositionalMix(positionalTarget, "--package", commandName, packages[0] ?? "");

    return resolveTargetStrict(packages.join(","), deps);
  }

  if (options.file !== undefined) {
    const files = normalizeVariadicFlag("--file", options.file);
    assertNoPositionalMix(positionalTarget, "--file", commandName, files[0] ?? "");
    return { type: "file", value: files };
  }

  if (!positionalTarget) {
    return { type: "all", value: [] };
  }

  return resolvePositionalTarget(positionalTarget, commandName, deps);
}

function resolvePositionalTarget(
  target: string,
  commandName: string,
  deps: ResolverDeps,
): ResolvedTarget {
  // Auto-detect file paths by extension to avoid requiring --file for common use cases
  if (looksLikeFilePath(target)) {
    return { type: "file", value: [target] };
  }

  // Path-like targets (containing /) may be package directories (e.g., packages/cli2)
  if (target.includes("/")) {
    try {
      return resolveTargetStrict(target, deps);
    } catch {
      // Fall through to ambiguous error
    }
  }

  throw new Error(
    `Ambiguous input: "${target}". Use --package or --file to specify target type.\n` +
      `Example: just ${commandName} --package ${target} or just ${commandName} --file ${target}`,
  );
}

function getSinglePositionalTarget(
  positionalTargets: string[] | string | undefined,
): string | undefined {
  const rawTargets = Array.isArray(positionalTargets)
    ? positionalTargets
    : typeof positionalTargets === "string"
      ? [positionalTargets]
      : [];

  const normalized = rawTargets
    .map((target) => target.trim())
    .filter((target) => target.length > 0);

  if (normalized.length > 1) {
    throw new Error(
      `Multiple positional targets are not supported yet: ${normalized.join(", ")}.\n` +
        "Use a single --package or --file flag until multi-target support ships.",
    );
  }

  return normalized[0];
}

function assertNoPositionalMix(
  positionalTarget: string | undefined,
  flagLabel: "--package" | "--file",
  commandName: string,
  exampleValue: string,
): void {
  if (!positionalTarget) return;

  const sanitizedValue = exampleValue || "<value>";
  throw new Error(
    `Cannot combine positional target "${positionalTarget}" with ${flagLabel}.\n` +
      `Example: just ${commandName} ${flagLabel} ${sanitizedValue}`,
  );
}

/**
 * Normalize a variadic flag value (string[]) into a flat array of non-empty tokens.
 * Supports comma-separated values within items and trims whitespace.
 */
export function normalizeVariadicFlag(
  flagLabel: "--package" | "--file",
  values: string[],
): string[] {
  const result = values.flatMap((v) => parseQueryTokens(v)).filter(Boolean);

  if (!result.length) {
    throw new Error(`${flagLabel} requires at least one non-empty value`);
  }

  return result;
}
