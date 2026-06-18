import { type Dirent, type Stats } from 'node:fs';
/** Target resolution type */
export type TargetType = 'all' | 'file' | 'package';
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
/** File system operations interface for dependency injection */
export interface FileSystem {
    existsSync: (path: string) => boolean;
    statSync: (path: string) => Stats;
    readdirSync: (path: string) => Dirent[];
    readFileSync: (path: string) => string;
}
/** Default file system implementation using Node.js fs */
export declare const defaultFs: FileSystem;
/** Dependencies that can be injected for testing */
export interface ResolverDeps {
    fs?: FileSystem;
    repoRoot?: string;
    workspacePackages?: PackageInfo[];
    /** Bypass ambiguity checks (for backward compatibility) */
    force?: boolean;
}
/** Directories containing subdirectory packages */
export declare const SUBDIRECTORY_PACKAGES: readonly ["apps", "apps/web", "apps/workers", "apps/containers", "apps/agile-vibe", "packages/foundation", "packages/core", "packages/cli", "packages/feature", "packages/sdk"];
/** Root-level package directories */
export declare const ROOT_LEVEL_PACKAGES: readonly ["infra"];
/** Category queries that match multiple packages */
export declare const CATEGORY_QUERIES: readonly ["platform", "admin", "website"];
/** Directories to skip when scanning for packages */
export declare const SKIP_DIRECTORIES: readonly ["templates", "node_modules"];
/** Maximum depth when searching for repo root */
export declare const MAX_REPO_SEARCH_DEPTH = 100;
/** Workspace marker file */
export declare const WORKSPACE_MARKER = "pnpm-workspace.yaml";
/** File extensions that indicate a file target (not a package name) */
export declare const FILE_EXTENSIONS: readonly [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs", ".json", ".css", ".scss", ".html", ".vue", ".svelte"];
/** Common path prefixes to try when resolving partial paths */
export declare const PATH_PREFIXES: readonly ["packages/foundation", "packages/core", "packages/cli", "packages/feature", "packages/sdk", "apps/web", "apps/workers", "apps/containers", "apps/agile-vibe"];
export declare function getPackageShortName(packageName: string): string;
/**
 * Check if a target string looks like a file path based on its extension.
 * This is a pure string check — no filesystem access.
 */
export declare function looksLikeFilePath(target: string): boolean;
/**
 * Find repository root by looking for pnpm-workspace.yaml
 * @param startDir - Directory to start searching from
 * @param fs - File system interface (injectable for testing)
 * @returns Path to repository root, or startDir if not found
 */
export declare function findRepoRoot(startDir: string, fs?: FileSystem): string;
/**
 * Check if a path exists as a file (not a directory - directories are treated as packages)
 * @param target - Path to check (absolute or relative to repoRoot)
 * @param repoRoot - Repository root for resolving relative paths
 * @param fs - File system interface (injectable for testing)
 * @returns true if the path exists as a file
 */
export declare function isFilePath(target: string, repoRoot: string, fs?: FileSystem): boolean;
/**
 * Generate all candidate paths to try for a given target.
 * Pure function - no filesystem access, fully testable.
 *
 * @param target - The target path (may be partial like "cli2/src/cli.ts")
 * @returns Array of candidate paths to try, in priority order
 */
export declare function generatePathCandidates(target: string): string[];
/**
 * Find the first existing path from a list of candidates.
 * Separates filesystem access from path generation for testability.
 *
 * @param candidates - Array of candidate paths to check
 * @param repoRoot - Repository root for resolving relative paths
 * @param fs - File system interface (injectable for testing)
 * @returns The first existing path, or null if none exist
 */
export declare function findFirstExistingPath(candidates: string[], repoRoot: string, fs?: FileSystem): string | null;
/**
 * Resolve a partial path by trying common prefixes.
 * Composed from pure generatePathCandidates + findFirstExistingPath.
 *
 * @param target - Partial path to resolve (e.g., "cli2/src/cli.ts")
 * @param repoRoot - Repository root for resolving paths
 * @param fs - File system interface (injectable for testing)
 * @returns Resolved full path if found, or null if not found
 */
export declare function resolvePartialPath(target: string, repoRoot: string, fs?: FileSystem): string | null;
/**
 * Read package.json and extract package info
 * @param packagePath - Path to the package directory
 * @param fs - File system interface (injectable for testing)
 * @returns PackageInfo or null if package.json is invalid/missing
 */
export declare function readPackageInfo(packagePath: string, fs?: FileSystem): PackageInfo | null;
/**
 * Check if a directory entry should be skipped
 * @param name - Directory name to check
 * @returns true if the directory should be skipped
 */
export declare function shouldSkipDirectory(name: string): boolean;
/**
 * Get packages from a subdirectory (e.g., apps/web, packages)
 * @param baseDir - Full path to the base directory
 * @param fs - File system interface (injectable for testing)
 * @returns Array of PackageInfo for valid packages in the directory
 */
export declare function getSubdirectoryPackages(baseDir: string, fs?: FileSystem): PackageInfo[];
/**
 * Get all workspace packages dynamically
 * @param repoRoot - Repository root path
 * @param fs - File system interface (injectable for testing)
 * @returns Array of all PackageInfo in the workspace
 */
export declare function getWorkspacePackages(repoRoot: string, fs?: FileSystem): PackageInfo[];
/**
 * Check if a package matches a query string
 * @param pkg - Package info to check
 * @param query - Query string to match against
 * @returns true if the package matches the query
 */
export declare function matchPackage(pkg: PackageInfo, query: string): boolean;
/**
 * Check if a query is a category query (platform, admin, website)
 * @param query - Query string to check
 * @returns true if the query is a category query
 */
export declare function isCategoryQuery(query: string): boolean;
/**
 * Parse a target string into individual query tokens
 * @param target - Target string (may contain commas or whitespace)
 * @returns Array of trimmed, non-empty query tokens
 */
export declare function parseQueryTokens(target: string): string[];
/**
 * Find packages matching a single query
 * @param packages - Array of workspace packages
 * @param query - Query string to match
 * @returns Array of matching PackageInfo
 */
export declare function findMatchingPackages(packages: PackageInfo[], query: string): PackageInfo[];
/**
 * Resolve package targets to workspace filter flags
 * @param target - Target string to resolve
 * @param packages - Array of workspace packages
 * @returns Array of workspace filter flags (e.g., ['--filter=@scope/cli'])
 */
export declare function resolvePackageFilters(target: string, packages: PackageInfo[]): string[];
/**
 * Resolve package targets to directory paths (relative to repo root)
 * @param target - Target string to resolve
 * @param packages - Array of workspace packages
 * @returns Array of package directory paths (e.g., ['packages/cli2', 'packages/config'])
 */
export declare function resolvePackagePaths(target: string, packages: PackageInfo[]): string[];
/**
 * Resolve a target string to package filters (strict mode).
 * Only package/category queries are allowed here.
 */
export declare function resolveTargetStrict(target?: string, deps?: ResolverDeps): ResolvedTarget;
/**
 * Resolve command targets based on explicit flags (strict mode).
 * Rejects ambiguous inputs with clear error messages.
 */
/**
 * Resolve command targets based on explicit flags (strict mode).
 * Positional arguments are validated but require a flag to apply.
 */
export declare function resolveCommandTargets(commandName: string, positionalTargets: string[], options?: CommandTargetOptions, deps?: ResolverDeps): ResolvedTarget;
/**
 * Normalize a variadic flag value (string[]) into a flat array of non-empty tokens.
 * Supports comma-separated values within items and trims whitespace.
 */
export declare function normalizeVariadicFlag(flagLabel: '--package' | '--file', values: string[]): string[];
//# sourceMappingURL=target-resolver.d.ts.map