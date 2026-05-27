import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
/**
 * Default filesystem implementation using Node.js fs module.
 */
export const realFileSystem = {
    existsSync,
    readFileSync: (path, encoding) => readFileSync(path, encoding),
};
/**
 * PackageGraph analyzes monorepo package structure for dependency detection.
 *
 * Used by the false dependency detector to determine if tasks can run in parallel
 * based on package boundaries and cross-package dependencies.
 *
 * Implements IPackageGraph interface for testability - filesystem can be mocked.
 */
export class PackageGraph {
    root;
    fs;
    packageCache = new Map();
    packageJsonCache = new Map();
    constructor(root, fs = realFileSystem) {
        this.root = root;
        this.fs = fs;
    }
    /**
     * Find the package root (directory containing package.json) for a file path.
     * Walks up the directory tree until package.json is found.
     *
     * @param filePath - Relative path from monorepo root
     * @returns Relative path to package root, or null if not found
     */
    findPackageRoot(filePath) {
        if (this.packageCache.has(filePath)) {
            return this.packageCache.get(filePath) ?? null;
        }
        let currentDir = dirname(join(this.root, filePath));
        const rootAbs = this.root;
        while (currentDir.length >= rootAbs.length) {
            const pkgJsonPath = join(currentDir, 'package.json');
            if (this.fs.existsSync(pkgJsonPath)) {
                const result = relative(this.root, currentDir);
                this.packageCache.set(filePath, result);
                return result;
            }
            const parentDir = dirname(currentDir);
            if (parentDir === currentDir)
                break;
            currentDir = parentDir;
        }
        this.packageCache.set(filePath, null);
        return null;
    }
    /**
     * Get the package name from package.json.
     *
     * @param packageRoot - Relative path to package root
     * @returns Package name or null if not found
     */
    getPackageName(packageRoot) {
        const pkgJson = this.loadPackageJson(packageRoot);
        return pkgJson?.name ?? null;
    }
    /**
     * Check if package A has a dependency on package B.
     *
     * @param packageRootA - Relative path to first package
     * @param packageRootB - Relative path to second package
     * @returns True if A depends on B (directly)
     */
    hasCrossPackageDependency(packageRootA, packageRootB) {
        const pkgA = this.loadPackageJson(packageRootA);
        const pkgB = this.loadPackageJson(packageRootB);
        if (!pkgA || !pkgB)
            return false;
        const bName = pkgB.name;
        const aDeps = {
            ...pkgA.dependencies,
            ...pkgA.devDependencies,
        };
        return bName in aDeps;
    }
    /**
     * Check if two file paths belong to the same package.
     *
     * @param filePathA - First file path (relative)
     * @param filePathB - Second file path (relative)
     * @returns True if both files are in the same package
     */
    areInSamePackage(filePathA, filePathB) {
        const pkgA = this.findPackageRoot(filePathA);
        const pkgB = this.findPackageRoot(filePathB);
        if (pkgA === null || pkgB === null)
            return false;
        return pkgA === pkgB;
    }
    /**
     * Clear all caches. Useful for testing or when package structure changes.
     */
    clearCache() {
        this.packageCache.clear();
        this.packageJsonCache.clear();
    }
    /**
     * Get all cached package roots.
     */
    getCachedPackageRoots() {
        return Array.from(this.packageCache.values()).filter((v) => v !== null);
    }
    loadPackageJson(packageRoot) {
        if (this.packageJsonCache.has(packageRoot)) {
            return this.packageJsonCache.get(packageRoot) ?? null;
        }
        const pkgJsonPath = join(this.root, packageRoot, 'package.json');
        if (!this.fs.existsSync(pkgJsonPath)) {
            this.packageJsonCache.set(packageRoot, null);
            return null;
        }
        try {
            const content = this.fs.readFileSync(pkgJsonPath, 'utf-8');
            const parsed = JSON.parse(content);
            this.packageJsonCache.set(packageRoot, parsed);
            return parsed;
        }
        catch {
            this.packageJsonCache.set(packageRoot, null);
            return null;
        }
    }
}
/**
 * Create a mock filesystem for testing.
 * @param files - Map of file paths to contents (or null for non-existent)
 */
export function createMockFileSystem(files) {
    return {
        existsSync: (path) => files.has(path) && files.get(path) !== null,
        readFileSync: (path, _encoding) => {
            const content = files.get(path);
            if (content === null || content === undefined) {
                throw new Error(`ENOENT: no such file or directory, open '${path}'`);
            }
            return content;
        },
    };
}
//# sourceMappingURL=package-graph.js.map