import type { IFileSystem, IPackageGraph } from '#dag/interfaces';
/**
 * Default filesystem implementation using Node.js fs module.
 */
export declare const realFileSystem: IFileSystem;
/**
 * PackageGraph analyzes monorepo package structure for dependency detection.
 *
 * Used by the false dependency detector to determine if tasks can run in parallel
 * based on package boundaries and cross-package dependencies.
 *
 * Implements IPackageGraph interface for testability - filesystem can be mocked.
 */
export declare class PackageGraph implements IPackageGraph {
    private readonly root;
    private readonly fs;
    private readonly packageCache;
    private readonly packageJsonCache;
    constructor(root: string, fs?: IFileSystem);
    /**
     * Find the package root (directory containing package.json) for a file path.
     * Walks up the directory tree until package.json is found.
     *
     * @param filePath - Relative path from monorepo root
     * @returns Relative path to package root, or null if not found
     */
    findPackageRoot(filePath: string): string | null;
    /**
     * Get the package name from package.json.
     *
     * @param packageRoot - Relative path to package root
     * @returns Package name or null if not found
     */
    getPackageName(packageRoot: string): string | null;
    /**
     * Check if package A has a dependency on package B.
     *
     * @param packageRootA - Relative path to first package
     * @param packageRootB - Relative path to second package
     * @returns True if A depends on B (directly)
     */
    hasCrossPackageDependency(packageRootA: string, packageRootB: string): boolean;
    /**
     * Check if two file paths belong to the same package.
     *
     * @param filePathA - First file path (relative)
     * @param filePathB - Second file path (relative)
     * @returns True if both files are in the same package
     */
    areInSamePackage(filePathA: string, filePathB: string): boolean;
    /**
     * Clear all caches. Useful for testing or when package structure changes.
     */
    clearCache(): void;
    /**
     * Get all cached package roots.
     */
    getCachedPackageRoots(): string[];
    private loadPackageJson;
}
/**
 * Create a mock filesystem for testing.
 * @param files - Map of file paths to contents (or null for non-existent)
 */
export declare function createMockFileSystem(files: Map<string, string | null>): IFileSystem;
//# sourceMappingURL=package-graph.d.ts.map